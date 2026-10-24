use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use sqlx::PgPool;

use super::outline::store_outline;
use super::tiers::{
    BrowseTier, browse_query, collect_browse, tiers_for_span, tiles_bbox, tiles_for_bbox,
};
use crate::models::region::{RegionKind, RegionOutline};
use crate::overpass::{FETCH_LOCK, client, lock_background, run_query};
use crate::query::regions::{assign_countries, in_bbox, mark_tiles, missing_tiles};

/// Most tiles one request will fetch. A viewport at the state tier can be
/// two dozen tiles short, and fetching their union as one box means asking
/// OSM for every boundary in a continent. The client polls while anything is
/// still missing, so the rest arrive on the next round instead.
const MAX_TILES_PER_FILL: usize = 4;

/// Tiles a fill is working on right now. Panning over uncovered ground asks
/// for overlapping viewports in quick succession, and assembling a district
/// boundary takes seconds - without this they would all fetch the same
/// ground at once.
static FILLING: LazyLock<Mutex<HashSet<(BrowseTier, i32, i32)>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// Most tiles claimed by fills at any moment, across all callers. Fetches run
/// one at a time, so a longer queue only holds memory and stored tiles; a
/// request that finds the queue full claims nothing and still answers
/// `filling`, so the client asks again once there is room.
const MAX_FILLING_TILES: usize = 32;

type TileKey = (BrowseTier, i32, i32);

fn fill_set() -> MutexGuard<'static, HashSet<TileKey>> {
    FILLING.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Tiles claimed from `FILLING`. Dropping the claim releases them, so a
/// failed request, a panicking task or a shutdown mid-fill cannot leave tiles
/// held for good.
struct Claim {
    tier: BrowseTier,
    tiles: Vec<(i32, i32)>,
}

impl Claim {
    /// Claim up to `room` of the missing tiles that no fill holds yet.
    fn take(tier: BrowseTier, missing: &[(i32, i32)], room: usize) -> Claim {
        let mut filling = fill_set();
        let room = MAX_FILLING_TILES.saturating_sub(filling.len()).min(room);
        let tiles = claim_tiles(&mut filling, tier, missing, room);
        Claim { tier, tiles }
    }
}

impl Drop for Claim {
    fn drop(&mut self) {
        let mut filling = fill_set();
        for (x, y) in &self.tiles {
            filling.remove(&(self.tier, *x, *y));
        }
    }
}

/// Claim up to `room` of the missing tiles that no fill holds yet.
fn claim_tiles(
    filling: &mut HashSet<TileKey>,
    tier: BrowseTier,
    missing: &[(i32, i32)],
    room: usize,
) -> Vec<(i32, i32)> {
    let mut claimed = vec![];
    for &(x, y) in missing {
        if claimed.len() >= room {
            break;
        }
        if filling.insert((tier, x, y)) {
            claimed.push((x, y));
        }
    }
    claimed
}

/// Wait before retrying a tile after its first failure; doubles per failure.
const RETRY_BASE: Duration = Duration::from_secs(60);
/// Longest wait before a failing tile is tried again.
const RETRY_MAX: Duration = Duration::from_secs(60 * 60);
/// Most failing tiles remembered; the soonest to expire go first.
const MAX_FAILED_TILES: usize = 1024;

/// Tiles whose fetch failed, with when they may be tried again. A tile that
/// needs longer than Overpass allows would otherwise be requested again on
/// every pan while Overpass keeps computing the abandoned query.
#[derive(Default)]
struct FailedTiles {
    tiles: HashMap<TileKey, (u32, Instant)>,
}

impl FailedTiles {
    fn delay(failures: u32) -> Duration {
        RETRY_BASE
            .saturating_mul(2u32.saturating_pow(failures.saturating_sub(1)))
            .min(RETRY_MAX)
    }

    fn record(&mut self, key: TileKey, now: Instant) {
        let failures = self.tiles.get(&key).map_or(0, |(n, _)| *n) + 1;
        self.tiles
            .insert(key, (failures, now + Self::delay(failures)));
        if self.tiles.len() > MAX_FAILED_TILES {
            if let Some(soonest) = self
                .tiles
                .iter()
                .min_by_key(|(_, (_, at))| *at)
                .map(|(k, _)| *k)
            {
                self.tiles.remove(&soonest);
            }
        }
    }

    fn is_backed_off(&self, key: &TileKey, now: Instant) -> bool {
        self.tiles
            .get(key)
            .is_some_and(|(_, retry_at)| now < *retry_at)
    }

    fn clear(&mut self, key: &TileKey) {
        self.tiles.remove(key);
    }
}

static FAILED: LazyLock<Mutex<FailedTiles>> = LazyLock::new(Mutex::default);

fn failed_tiles() -> MutexGuard<'static, FailedTiles> {
    FAILED.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Make sure a viewport's regions are on their way, and say whether any are
/// still missing. Assembling boundaries takes long enough that the fetch
/// runs detached: the caller answers from what is stored and asks again.
pub async fn ensure_browse_fill(
    pool: &PgPool,
    tier: BrowseTier,
    bbox: (f64, f64, f64, f64),
) -> Result<bool, sqlx::Error> {
    // Countries come first: the tier's own regions are told which country
    // they are in once both are stored, and only the country boundaries can
    // say so.
    let wanted = [BrowseTier::Countries, tier];
    let mut pending = false;
    let mut work: Vec<Claim> = vec![];
    for tier in wanted {
        if work.iter().any(|claim| claim.tier == tier) {
            continue;
        }
        let mut missing = missing_tiles(pool, tier.as_str(), &tiles_for_bbox(tier, bbox)).await?;
        // A tile that failed lately is not on its way; asking again now
        // would only repeat the failure.
        let now = Instant::now();
        {
            let failed = failed_tiles();
            missing.retain(|&(x, y)| !failed.is_backed_off(&(tier, x, y), now));
        }
        if missing.is_empty() {
            continue;
        }
        pending = true;
        // Nearest the middle of the screen first, so what the eye is on
        // fills before the corners.
        let (south, west, north, east) = bbox;
        let size = tier.tile_deg();
        let (cx, cy) = ((west + east) / 2.0 / size, (south + north) / 2.0 / size);
        missing.sort_by(|a, b| {
            let d =
                |(x, y): &(i32, i32)| (f64::from(*x) - cx).powi(2) + (f64::from(*y) - cy).powi(2);
            d(a).total_cmp(&d(b))
        });
        let claim = Claim::take(tier, &missing, MAX_TILES_PER_FILL);
        if !claim.tiles.is_empty() {
            work.push(claim);
        }
    }

    if !work.is_empty() {
        let pool = pool.clone();
        tokio::spawn(async move {
            for claim in &work {
                if let Err(err) = fill_tiles(&pool, claim.tier, &claim.tiles).await {
                    tracing::warn!("Filling {} region tiles failed: {err}", claim.tier.as_str());
                }
            }
            // Over the whole country tile, not just the viewport that
            // asked: one country boundary places every region under it,
            // including those stored before it was fetched.
            let covered = tiles_for_bbox(BrowseTier::Countries, bbox);
            if let Some(area) = tiles_bbox(BrowseTier::Countries, &covered) {
                match assign_countries(&pool, area).await {
                    Ok(0) => {}
                    Ok(count) => tracing::info!("Placed {count} region(s) in their country"),
                    Err(err) => tracing::warn!("Placing regions in their country failed: {err}"),
                }
            }
            // The claims drop with `work`, here or on a panic above.
            drop(work);
        });
    }
    Ok(pending)
}

/// What a viewport shows: the stored regions, whether more are on their way,
/// and the kinds left out for being too wide.
pub struct Browse {
    pub regions: Vec<RegionOutline>,
    pub filling: bool,
    pub hidden: Vec<RegionKind>,
}

/// Regions of the chosen tiers (or the one the span picks) overlapping a
/// viewport, starting a background fill for any ground not stored yet.
pub async fn browse(
    pool: &PgPool,
    bbox: (f64, f64, f64, f64),
    chosen: Option<Vec<BrowseTier>>,
) -> Result<Browse, sqlx::Error> {
    let (south, west, north, east) = bbox;
    let span = (east - west).max(north - south);
    let (tiers, hidden) = tiers_for_span(chosen, span);
    let mut filling = false;
    let mut regions = vec![];
    for tier in tiers {
        filling |= ensure_browse_fill(pool, tier, bbox).await?;
        regions.extend(in_bbox(pool, bbox, &[tier.kind()], tier.limit()).await?);
    }
    Ok(Browse {
        regions,
        filling,
        hidden,
    })
}

/// Fetch the tier's regions for a set of tiles from OSM and store them.
/// Tiles are marked even when they held nothing, so empty ground is asked
/// for exactly once.
async fn fill_tiles(pool: &PgPool, tier: BrowseTier, tiles: &[(i32, i32)]) -> anyhow::Result<()> {
    // One query per tile rather than one over their union: the union of even
    // a few state tiles spans a continent, and a tile that is fetched is
    // marked straight away, so a long run keeps its progress.
    for tile in tiles {
        let Some(bbox) = tiles_bbox(tier, std::slice::from_ref(tile)) else {
            continue;
        };
        let key = (tier, tile.0, tile.1);
        let fetched = {
            let _guard = lock_background(&FETCH_LOCK).await;
            run_query(client(), &browse_query(tier, bbox)).await
        };
        let found = match fetched {
            Ok(response) => collect_browse(response),
            Err(err) => {
                failed_tiles().record(key, Instant::now());
                return Err(err);
            }
        };
        for region in &found {
            store_outline(
                pool,
                &region.name,
                region.country.as_deref(),
                &region.source,
            )
            .await?;
        }
        mark_tiles(pool, tier.as_str(), std::slice::from_ref(tile)).await?;
        failed_tiles().clear(&key);
        tracing::info!(
            "Stored {} {} region(s) for tile {},{}",
            found.len(),
            tier.as_str(),
            tile.0,
            tile.1
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_full_queue_claims_nothing() {
        let mut filling = HashSet::new();
        let tiles = [(1, 1), (2, 2), (3, 3)];
        assert_eq!(
            claim_tiles(&mut filling, BrowseTier::Valleys, &tiles, 2).len(),
            2
        );
        assert_eq!(filling.len(), 2);
        // No room left: nothing is claimed and nothing is held.
        assert!(claim_tiles(&mut filling, BrowseTier::Valleys, &tiles, 0).is_empty());
        assert_eq!(filling.len(), 2);
        // A tile already held is not claimed twice.
        assert_eq!(
            claim_tiles(&mut filling, BrowseTier::Valleys, &tiles, 5),
            [(3, 3)]
        );
    }

    #[test]
    fn dropping_a_claim_releases_its_tiles() {
        // Coordinates no other test uses, as FILLING is process-wide.
        let tiles = [(900_001, 1), (900_002, 1)];
        let claim = Claim::take(BrowseTier::Valleys, &tiles, 4);
        assert_eq!(claim.tiles.len(), 2);
        assert!(Claim::take(BrowseTier::Valleys, &tiles, 4).tiles.is_empty());
        drop(claim);
        assert_eq!(Claim::take(BrowseTier::Valleys, &tiles, 4).tiles.len(), 2);
    }

    #[test]
    fn a_panicking_fill_releases_its_claim() {
        let tiles = [(900_003, 1)];
        let result = std::panic::catch_unwind(|| {
            let _claim = Claim::take(BrowseTier::Valleys, &tiles, 4);
            panic!("fill failed");
        });
        assert!(result.is_err());
        assert_eq!(Claim::take(BrowseTier::Valleys, &tiles, 4).tiles.len(), 1);
    }

    #[test]
    fn failed_tiles_back_off_exponentially() {
        let key = (BrowseTier::Valleys, 1, 1);
        let start = Instant::now();
        let mut failed = FailedTiles::default();
        assert!(!failed.is_backed_off(&key, start));
        failed.record(key, start);
        assert!(failed.is_backed_off(&key, start + RETRY_BASE - Duration::from_secs(1)));
        assert!(!failed.is_backed_off(&key, start + RETRY_BASE));
        failed.record(key, start);
        assert!(failed.is_backed_off(&key, start + RETRY_BASE * 2 - Duration::from_secs(1)));
        for _ in 0..40 {
            failed.record(key, start);
        }
        assert!(!failed.is_backed_off(&key, start + RETRY_MAX));
        failed.clear(&key);
        assert!(!failed.is_backed_off(&key, start));
    }

    #[test]
    fn remembered_failures_are_bounded() {
        let now = Instant::now();
        let mut failed = FailedTiles::default();
        for x in 0..(MAX_FAILED_TILES as i32 + 10) {
            failed.record((BrowseTier::Valleys, x, 0), now);
        }
        assert_eq!(failed.tiles.len(), MAX_FAILED_TILES);
    }
}
