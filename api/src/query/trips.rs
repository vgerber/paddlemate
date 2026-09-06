use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::{
    trip::{
        CreateTripRequest, PatchTripMemberRequest, PatchTripRequest, PatchTripStayRequest, Trip,
        TripId, TripMember, TripMemberRole, TripSection, TripSectionInput, TripSectionStatus,
        TripStay, TripStayId, TripStayKind,
    },
    visibility::Visibility,
    waterway::PaginatedResponse,
};

/// Trips a signed-in viewer may see. `viewer` is the placeholder holding their
/// id, so the same predicate serves the detail and list queries.
fn visible_clause(viewer: &str) -> String {
    format!(
        "(EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = trips.id AND tm.user_id = {viewer}) \
         OR (trips.visibility_scope = 'public' AND (trips.visible_from IS NULL OR trips.visible_from <= NOW())) \
         OR (trips.visibility_scope = 'shared' AND EXISTS ( \
             SELECT 1 FROM trip_visible_users WHERE trip_id = trips.id AND user_id = {viewer} \
         )) \
         OR (trips.visibility_scope = 'shared' AND EXISTS ( \
             SELECT 1 FROM trip_visible_groups tvg \
             JOIN group_members gm ON gm.group_id = tvg.group_id \
             WHERE tvg.trip_id = trips.id AND gm.user_id = {viewer} \
         )))"
    )
}

const PUBLIC_CLAUSE: &str =
    "(trips.visibility_scope = 'public' AND (trips.visible_from IS NULL OR trips.visible_from <= NOW()))";

/// Counts ride along as subqueries so a listing stays one round trip. The
/// descent count is logs, not runs: every paddler keeps their own.
fn trip_cols(viewer: &str) -> String {
    format!(
        "trips.id, trips.name, trips.description, trips.start_date, trips.end_date, \
         trips.visibility_scope::text AS visibility_scope, trips.visible_from, \
         trips.created_by, trips.created_at, trips.updated_at, \
         (SELECT COUNT(*) FROM trip_members tm WHERE tm.trip_id = trips.id) AS member_count, \
         (SELECT COUNT(*) FROM descents d WHERE d.trip_id = trips.id) AS descent_count, \
         (SELECT tm.role::text FROM trip_members tm \
          WHERE tm.trip_id = trips.id AND tm.user_id = {viewer}) AS viewer_role"
    )
}

fn row_to_trip(row: &PgRow) -> Result<Trip, sqlx::Error> {
    // Visibility audience is populated later by enrich_trip.
    let visibility = match row.try_get::<String, _>("visibility_scope")?.as_str() {
        "public" => Visibility::Public,
        "shared" => Visibility::Shared {
            users: vec![],
            groups: vec![],
        },
        _ => Visibility::Private,
    };
    let viewer_role = match row.try_get::<Option<String>, _>("viewer_role")?.as_deref() {
        Some("admin") => Some(TripMemberRole::Admin),
        Some(_) => Some(TripMemberRole::Member),
        None => None,
    };
    Ok(Trip {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        start_date: row.try_get("start_date")?,
        end_date: row.try_get("end_date")?,
        visibility,
        visible_from: row.try_get("visible_from")?,
        created_by: row.try_get("created_by")?,
        viewer_role,
        member_count: row.try_get::<Option<i64>, _>("member_count")?.unwrap_or(0),
        descent_count: row.try_get::<Option<i64>, _>("descent_count")?.unwrap_or(0),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

async fn load_audience(pool: &PgPool, trip_id: TripId) -> Result<(Vec<String>, Vec<i64>), sqlx::Error> {
    let users = sqlx::query("SELECT user_id FROM trip_visible_users WHERE trip_id = $1 ORDER BY user_id")
        .bind(trip_id)
        .fetch_all(pool)
        .await?
        .iter()
        .map(|r| r.try_get::<String, _>("user_id"))
        .collect::<Result<_, _>>()?;
    let groups =
        sqlx::query("SELECT group_id FROM trip_visible_groups WHERE trip_id = $1 ORDER BY group_id")
            .bind(trip_id)
            .fetch_all(pool)
            .await?
            .iter()
            .map(|r| r.try_get::<i64, _>("group_id"))
            .collect::<Result<_, _>>()?;
    Ok((users, groups))
}

async fn enrich_trip(pool: &PgPool, mut trip: Trip) -> Result<Trip, sqlx::Error> {
    if let Visibility::Shared {
        ref mut users,
        ref mut groups,
    } = trip.visibility
    {
        let (u, g) = load_audience(pool, trip.id).await?;
        *users = u;
        *groups = g;
    }
    Ok(trip)
}

async fn write_audience(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    trip_id: TripId,
    visibility: &Visibility,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM trip_visible_users WHERE trip_id = $1")
        .bind(trip_id)
        .execute(&mut **tx)
        .await?;
    sqlx::query("DELETE FROM trip_visible_groups WHERE trip_id = $1")
        .bind(trip_id)
        .execute(&mut **tx)
        .await?;

    let Visibility::Shared { users, groups } = visibility else {
        return Ok(());
    };
    for uid in users {
        sqlx::query("INSERT INTO trip_visible_users (trip_id, user_id) VALUES ($1, $2)")
            .bind(trip_id)
            .bind(uid)
            .execute(&mut **tx)
            .await?;
    }
    for gid in groups {
        sqlx::query("INSERT INTO trip_visible_groups (trip_id, group_id) VALUES ($1, $2)")
            .bind(trip_id)
            .bind(gid)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

pub async fn member_role(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<Option<TripMemberRole>, sqlx::Error> {
    let row = sqlx::query("SELECT role::text AS role FROM trip_members WHERE trip_id = $1 AND user_id = $2")
        .bind(trip_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(match row {
        None => None,
        Some(r) => match r.try_get::<String, _>("role")?.as_str() {
            "admin" => Some(TripMemberRole::Admin),
            _ => Some(TripMemberRole::Member),
        },
    })
}

/// Whether the viewer may see the trip at all - the gate for open join.
pub async fn can_view(
    pool: &PgPool,
    trip_id: TripId,
    viewer_id: Option<&str>,
) -> Result<bool, sqlx::Error> {
    let sql = match viewer_id {
        Some(_) => format!(
            "SELECT 1 FROM trips WHERE trips.id = $1 AND {}",
            visible_clause("$2")
        ),
        None => format!("SELECT 1 FROM trips WHERE trips.id = $1 AND {PUBLIC_CLAUSE}"),
    };
    let mut q = sqlx::query(&sql).bind(trip_id);
    if let Some(vid) = viewer_id {
        q = q.bind(vid);
    }
    Ok(q.fetch_optional(pool).await?.is_some())
}

pub async fn create_trip(
    pool: &PgPool,
    user_id: &str,
    req: &CreateTripRequest,
) -> Result<Trip, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        "INSERT INTO trips (name, description, start_date, end_date, visibility_scope, visible_from, created_by) \
         VALUES ($1, $2, $3, $4, $5::visibility_scope, $6, $7) \
         RETURNING id, name, description, start_date, end_date, \
                   visibility_scope::text AS visibility_scope, visible_from, created_by, \
                   created_at, updated_at, \
                   0::bigint AS member_count, 0::bigint AS descent_count, \
                   NULL::text AS viewer_role",
    )
    .bind(&req.name)
    .bind(req.description.as_deref())
    .bind(req.start_date)
    .bind(req.end_date)
    .bind(req.visibility.scope_str())
    .bind(req.visible_from)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;

    let mut trip = row_to_trip(&row)?;

    // The creator is the first admin: ownership is a membership row, so it can
    // be handed over without touching the trip.
    sqlx::query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'admin')")
        .bind(trip.id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    insert_stay(&mut tx, trip.id, user_id, &req.stay).await?;
    write_audience(&mut tx, trip.id, &req.visibility).await?;

    tx.commit().await?;

    // Counted before the creator's own membership row existed.
    trip.member_count = 1;
    trip.viewer_role = Some(TripMemberRole::Admin);
    enrich_trip(pool, trip).await
}

pub async fn get_trip_for_viewer(
    pool: &PgPool,
    trip_id: TripId,
    viewer_id: Option<&str>,
) -> Result<Option<Trip>, sqlx::Error> {
    let row = match viewer_id {
        Some(vid) => {
            sqlx::query(&format!(
                "SELECT {} FROM trips WHERE trips.id = $1 AND {}",
                trip_cols("$2"),
                visible_clause("$2")
            ))
            .bind(trip_id)
            .bind(vid)
            .fetch_optional(pool)
            .await?
        }
        None => {
            sqlx::query(&format!(
                "SELECT {} FROM trips WHERE trips.id = $1 AND {PUBLIC_CLAUSE}",
                trip_cols("NULL")
            ))
            .bind(trip_id)
            .fetch_optional(pool)
            .await?
        }
    };

    match row {
        None => Ok(None),
        Some(r) => Ok(Some(enrich_trip(pool, row_to_trip(&r)?).await?)),
    }
}

pub struct ListFilters {
    /// "member" | "visible" (default "visible")
    pub scope: Option<String>,
    pub from: Option<chrono::NaiveDate>,
    pub to: Option<chrono::NaiveDate>,
    pub page: i64,
    pub per_page: i64,
}

pub async fn list_trips_for_viewer(
    pool: &PgPool,
    viewer_id: Option<&str>,
    filters: ListFilters,
) -> Result<PaginatedResponse<Trip>, sqlx::Error> {
    let offset = filters.page.saturating_sub(1) * filters.per_page;
    let empty = PaginatedResponse {
        items: vec![],
        total: 0,
        page: filters.page,
        per_page: filters.per_page,
        total_pages: 0,
    };

    // Anonymous callers have no membership, so "member" can only be empty.
    let Some(vid) = viewer_id else {
        if filters.scope.as_deref() == Some("member") {
            return Ok(empty);
        }
        return finish_list(pool, sqlx::query(&format!(
            "SELECT {}, COUNT(*) OVER() AS total_count FROM trips \
             WHERE {PUBLIC_CLAUSE} \
               AND ($1::date IS NULL OR COALESCE(trips.end_date, trips.start_date) >= $1) \
               AND ($2::date IS NULL OR trips.start_date <= $2) \
             ORDER BY trips.start_date DESC, trips.id DESC \
             LIMIT $3 OFFSET $4",
            trip_cols("NULL")
        ))
        .bind(filters.from)
        .bind(filters.to)
        .bind(filters.per_page)
        .bind(offset)
        .fetch_all(pool)
        .await?, filters).await;
    };

    let gate = if filters.scope.as_deref() == Some("member") {
        "EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = trips.id AND tm.user_id = $1)"
            .to_string()
    } else {
        visible_clause("$1")
    };

    let rows = sqlx::query(&format!(
        "SELECT {}, COUNT(*) OVER() AS total_count FROM trips \
         WHERE {gate} \
           AND ($2::date IS NULL OR COALESCE(trips.end_date, trips.start_date) >= $2) \
           AND ($3::date IS NULL OR trips.start_date <= $3) \
         ORDER BY trips.start_date DESC, trips.id DESC \
         LIMIT $4 OFFSET $5",
        trip_cols("$1")
    ))
    .bind(vid)
    .bind(filters.from)
    .bind(filters.to)
    .bind(filters.per_page)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    finish_list(pool, rows, filters).await
}

async fn finish_list(
    pool: &PgPool,
    rows: Vec<PgRow>,
    filters: ListFilters,
) -> Result<PaginatedResponse<Trip>, sqlx::Error> {
    let total: i64 = rows
        .first()
        .and_then(|r| r.try_get::<Option<i64>, _>("total_count").ok().flatten())
        .unwrap_or(0);

    let mut items = Vec::with_capacity(rows.len());
    for r in &rows {
        items.push(enrich_trip(pool, row_to_trip(r)?).await?);
    }

    Ok(PaginatedResponse {
        items,
        total,
        page: filters.page,
        per_page: filters.per_page,
        total_pages: (total + filters.per_page - 1) / filters.per_page,
    })
}

pub async fn patch_trip(
    pool: &PgPool,
    trip_id: TripId,
    actor_id: &str,
    req: &PatchTripRequest,
) -> Result<Option<Trip>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        "UPDATE trips SET \
             name         = COALESCE($2, name), \
             description  = CASE WHEN $3 THEN $4 ELSE description END, \
             start_date   = COALESCE($5, start_date), \
             end_date     = CASE WHEN $6 THEN $7 ELSE end_date END, \
             visibility_scope = COALESCE($8::visibility_scope, visibility_scope), \
             visible_from = CASE WHEN $9 THEN $10 ELSE visible_from END, \
             updated_at   = NOW() \
         WHERE id = $1 RETURNING id",
    )
    .bind(trip_id)
    .bind(req.name.as_deref())
    .bind(req.description.is_some())
    .bind(req.description.clone().flatten())
    .bind(req.start_date)
    .bind(req.end_date.is_some())
    .bind(req.end_date.flatten())
    .bind(req.visibility.as_ref().map(|v| v.scope_str()))
    .bind(req.visible_from.is_some())
    .bind(req.visible_from.flatten())
    .fetch_optional(&mut *tx)
    .await?;

    if row.is_none() {
        return Ok(None);
    }

    if let Some(vis) = &req.visibility {
        write_audience(&mut tx, trip_id, vis).await?;
    }

    tx.commit().await?;

    get_trip_for_viewer(pool, trip_id, Some(actor_id)).await
}

pub async fn delete_trip(pool: &PgPool, trip_id: TripId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM trips WHERE id = $1")
        .bind(trip_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

const MEMBER_SELECT: &str = "SELECT tm.trip_id, tm.user_id, u.username, tm.role::text AS role, \
     a.arrival, a.arrival_time, a.departure, a.departure_time, tm.created_at \
     FROM trip_members tm \
     JOIN users u ON u.id = tm.user_id \
     LEFT JOIN trip_member_attendance a \
            ON a.trip_id = tm.trip_id AND a.user_id = tm.user_id";

fn row_to_member(row: &PgRow) -> Result<TripMember, sqlx::Error> {
    Ok(TripMember {
        trip_id: row.try_get("trip_id")?,
        user_id: row.try_get("user_id")?,
        username: row.try_get("username")?,
        role: match row.try_get::<String, _>("role")?.as_str() {
            "admin" => TripMemberRole::Admin,
            _ => TripMemberRole::Member,
        },
        arrival: row.try_get("arrival")?,
        arrival_time: row.try_get("arrival_time")?,
        departure: row.try_get("departure")?,
        departure_time: row.try_get("departure_time")?,
        created_at: row.try_get("created_at")?,
    })
}

pub async fn list_members(pool: &PgPool, trip_id: TripId) -> Result<Vec<TripMember>, sqlx::Error> {
    sqlx::query(&format!(
        "{MEMBER_SELECT} WHERE tm.trip_id = $1 ORDER BY tm.role, u.username"
    ))
    .bind(trip_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(row_to_member)
    .collect()
}

pub async fn get_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<Option<TripMember>, sqlx::Error> {
    let row = sqlx::query(&format!("{MEMBER_SELECT} WHERE tm.trip_id = $1 AND tm.user_id = $2"))
        .bind(trip_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    row.as_ref().map(row_to_member).transpose()
}

/// Open join: anyone who may see the trip may join it as a member.
pub async fn join_trip(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<Option<TripMember>, sqlx::Error> {
    sqlx::query(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'member') \
         ON CONFLICT (trip_id, user_id) DO NOTHING",
    )
    .bind(trip_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    get_member(pool, trip_id, user_id).await
}

pub async fn admin_count(pool: &PgPool, trip_id: TripId) -> Result<i64, sqlx::Error> {
    let row = sqlx::query("SELECT COUNT(*) AS n FROM trip_members WHERE trip_id = $1 AND role = 'admin'")
        .bind(trip_id)
        .fetch_one(pool)
        .await?;
    row.try_get("n")
}

pub async fn remove_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2")
        .bind(trip_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn patch_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
    req: &PatchTripMemberRequest,
) -> Result<Option<TripMember>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    if let Some(role) = &req.role {
        let updated = sqlx::query(
            "UPDATE trip_members SET role = $3::trip_member_role, updated_at = NOW() \
             WHERE trip_id = $1 AND user_id = $2 RETURNING user_id",
        )
        .bind(trip_id)
        .bind(user_id)
        .bind(match role {
            TripMemberRole::Admin => "admin",
            TripMemberRole::Member => "member",
        })
        .fetch_optional(&mut *tx)
        .await?;
        if updated.is_none() {
            return Ok(None);
        }
    }

    let touches_attendance = req.arrival.is_some()
        || req.arrival_time.is_some()
        || req.departure.is_some()
        || req.departure_time.is_some();

    if touches_attendance {
        sqlx::query(
            "INSERT INTO trip_member_attendance \
                 (trip_id, user_id, arrival, arrival_time, departure, departure_time) \
             VALUES ($1, $2, $4, $6, $8, $10) \
             ON CONFLICT (trip_id, user_id) DO UPDATE SET \
                 arrival        = CASE WHEN $3 THEN $4 ELSE trip_member_attendance.arrival END, \
                 arrival_time   = CASE WHEN $5 THEN $6 ELSE trip_member_attendance.arrival_time END, \
                 departure      = CASE WHEN $7 THEN $8 ELSE trip_member_attendance.departure END, \
                 departure_time = CASE WHEN $9 THEN $10 ELSE trip_member_attendance.departure_time END, \
                 updated_at = NOW()",
        )
        .bind(trip_id)
        .bind(user_id)
        .bind(req.arrival.is_some())
        .bind(req.arrival.flatten())
        .bind(req.arrival_time.is_some())
        .bind(req.arrival_time.flatten())
        .bind(req.departure.is_some())
        .bind(req.departure.flatten())
        .bind(req.departure_time.is_some())
        .bind(req.departure_time.flatten())
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    get_member(pool, trip_id, user_id).await
}

fn row_to_stay(row: &PgRow) -> Result<TripStay, sqlx::Error> {
    Ok(TripStay {
        id: row.try_get("id")?,
        trip_id: row.try_get("trip_id")?,
        kind: match row.try_get::<String, _>("kind")?.as_str() {
            "camp" => TripStayKind::Camp,
            "hotel" => TripStayKind::Hotel,
            "bivouac" => TripStayKind::Bivouac,
            _ => TripStayKind::Other,
        },
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        location: row
            .try_get::<Option<String>, _>("location")?
            .and_then(|g| serde_json::from_str(&g).ok()),
        arrival: row.try_get("arrival")?,
        departure: row.try_get("departure")?,
        sections: vec![],
        created_by: row.try_get("created_by")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

const STAY_COLS: &str = "id, trip_id, kind::text AS kind, name, description, \
    ST_AsGeoJSON(location) AS location, arrival, departure, created_by, created_at, updated_at";

async fn insert_stay(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    trip_id: TripId,
    user_id: &str,
    req: &crate::models::trip::CreateTripStayRequest,
) -> Result<TripStay, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO trip_stays (trip_id, kind, name, description, location, arrival, departure, created_by) \
         VALUES ($1, $2::trip_stay_kind, $3, $4, \
                 CASE WHEN $5::double precision IS NULL OR $6::double precision IS NULL THEN NULL \
                      ELSE ST_SetSRID(ST_MakePoint($6, $5), 4326) END, \
                 $7, $8, $9) \
         RETURNING {STAY_COLS}"
    ))
    .bind(trip_id)
    .bind(stay_kind_str(&req.kind))
    .bind(&req.name)
    .bind(req.description.as_deref())
    .bind(req.lat)
    .bind(req.lon)
    .bind(req.arrival)
    .bind(req.departure)
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await?;
    row_to_stay(&row)
}

fn stay_kind_str(kind: &TripStayKind) -> &'static str {
    match kind {
        TripStayKind::Camp => "camp",
        TripStayKind::Hotel => "hotel",
        TripStayKind::Bivouac => "bivouac",
        TripStayKind::Other => "other",
    }
}

/// A timeline: ordered by arrival, falling back to creation while the date is
/// still unset, so a placeholder stay keeps the position it was added in.
pub async fn list_stays(pool: &PgPool, trip_id: TripId) -> Result<Vec<TripStay>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {STAY_COLS} FROM trip_stays WHERE trip_id = $1 \
         ORDER BY arrival NULLS LAST, created_at, id"
    ))
    .bind(trip_id)
    .fetch_all(pool)
    .await?;

    let mut stays: Vec<TripStay> = rows.iter().map(row_to_stay).collect::<Result<_, _>>()?;
    let ids: Vec<TripStayId> = stays.iter().map(|s| s.id).collect();
    let mut sections = load_sections(pool, &ids).await?;
    for s in &mut stays {
        s.sections = sections.remove(&s.id).unwrap_or_default();
    }
    Ok(stays)
}

async fn load_sections(
    pool: &PgPool,
    stay_ids: &[TripStayId],
) -> Result<std::collections::HashMap<TripStayId, Vec<TripSection>>, sqlx::Error> {
    let mut out: std::collections::HashMap<TripStayId, Vec<TripSection>> =
        std::collections::HashMap::new();
    if stay_ids.is_empty() {
        return Ok(out);
    }

    let rows = sqlx::query(
        "SELECT ts.id, ts.stay_id, ts.section_id, ts.sort_order, ts.status::text AS status, ts.note, \
                ws.name AS section_name, w.name AS waterway_name, ws.waterway_id, \
                ST_AsGeoJSON(ws.location) AS section_location \
         FROM trip_sections ts \
         LEFT JOIN water_sections ws ON ws.id = ts.section_id \
         LEFT JOIN waterways w ON w.id = ws.waterway_id \
         WHERE ts.stay_id = ANY($1) \
         ORDER BY ts.stay_id, ts.sort_order",
    )
    .bind(stay_ids)
    .fetch_all(pool)
    .await?;

    for r in &rows {
        let stay_id: TripStayId = r.try_get("stay_id")?;
        out.entry(stay_id).or_default().push(TripSection {
            id: r.try_get("id")?,
            stay_id,
            section_id: r.try_get("section_id")?,
            sort_order: r.try_get("sort_order")?,
            status: match r.try_get::<String, _>("status")?.as_str() {
                "optional" => TripSectionStatus::Optional,
                "done" => TripSectionStatus::Done,
                "skipped" => TripSectionStatus::Skipped,
                _ => TripSectionStatus::Planned,
            },
            note: r.try_get("note")?,
            section_name: r.try_get("section_name")?,
            waterway_name: r.try_get("waterway_name")?,
            waterway_id: r.try_get("waterway_id")?,
            location: r
                .try_get::<Option<String>, _>("section_location")?
                .and_then(|g| serde_json::from_str(&g).ok()),
        });
    }
    Ok(out)
}

pub async fn create_stay(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
    req: &crate::models::trip::CreateTripStayRequest,
) -> Result<TripStay, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let stay = insert_stay(&mut tx, trip_id, user_id, req).await?;
    tx.commit().await?;
    Ok(stay)
}

pub async fn patch_stay(
    pool: &PgPool,
    trip_id: TripId,
    stay_id: TripStayId,
    req: &PatchTripStayRequest,
) -> Result<Option<TripStay>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "UPDATE trip_stays SET \
             kind        = COALESCE($3::trip_stay_kind, kind), \
             name        = COALESCE($4, name), \
             description = CASE WHEN $5 THEN $6 ELSE description END, \
             location    = CASE WHEN $7 THEN \
                                CASE WHEN $8::double precision IS NULL OR $9::double precision IS NULL \
                                     THEN NULL ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326) END \
                           ELSE location END, \
             arrival     = CASE WHEN $10 THEN $11 ELSE arrival END, \
             departure   = CASE WHEN $12 THEN $13 ELSE departure END, \
             updated_at  = NOW() \
         WHERE trip_id = $1 AND id = $2 RETURNING {STAY_COLS}"
    ))
    .bind(trip_id)
    .bind(stay_id)
    .bind(req.kind.as_ref().map(stay_kind_str))
    .bind(req.name.as_deref())
    .bind(req.description.is_some())
    .bind(req.description.clone().flatten())
    .bind(req.lat.is_some() || req.lon.is_some())
    .bind(req.lat.flatten())
    .bind(req.lon.flatten())
    .bind(req.arrival.is_some())
    .bind(req.arrival.flatten())
    .bind(req.departure.is_some())
    .bind(req.departure.flatten())
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };
    let mut stay = row_to_stay(&row)?;
    let mut sections = load_sections(pool, &[stay.id]).await?;
    stay.sections = sections.remove(&stay.id).unwrap_or_default();
    Ok(Some(stay))
}

pub async fn stay_count(pool: &PgPool, trip_id: TripId) -> Result<i64, sqlx::Error> {
    let row = sqlx::query("SELECT COUNT(*) AS n FROM trip_stays WHERE trip_id = $1")
        .bind(trip_id)
        .fetch_one(pool)
        .await?;
    row.try_get("n")
}

pub async fn delete_stay(
    pool: &PgPool,
    trip_id: TripId,
    stay_id: TripStayId,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM trip_stays WHERE trip_id = $1 AND id = $2")
        .bind(trip_id)
        .bind(stay_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn replace_stay_sections(
    pool: &PgPool,
    trip_id: TripId,
    stay_id: TripStayId,
    sections: &[TripSectionInput],
) -> Result<Option<Vec<TripSection>>, sqlx::Error> {
    let exists = sqlx::query("SELECT 1 FROM trip_stays WHERE trip_id = $1 AND id = $2")
        .bind(trip_id)
        .bind(stay_id)
        .fetch_optional(pool)
        .await?;
    if exists.is_none() {
        return Ok(None);
    }

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM trip_sections WHERE stay_id = $1")
        .bind(stay_id)
        .execute(&mut *tx)
        .await?;

    for s in sections {
        sqlx::query(
            "INSERT INTO trip_sections (stay_id, section_id, sort_order, status, note) \
             VALUES ($1, $2, $3, COALESCE($4::trip_section_status, 'planned'), $5)",
        )
        .bind(stay_id)
        .bind(s.section_id)
        .bind(s.sort_order)
        .bind(s.status.as_ref().map(section_status_str))
        .bind(s.note.as_deref())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let mut loaded = load_sections(pool, &[stay_id]).await?;
    Ok(Some(loaded.remove(&stay_id).unwrap_or_default()))
}

fn section_status_str(status: &TripSectionStatus) -> &'static str {
    match status {
        TripSectionStatus::Planned => "planned",
        TripSectionStatus::Optional => "optional",
        TripSectionStatus::Done => "done",
        TripSectionStatus::Skipped => "skipped",
    }
}

pub async fn replace_visible_users(
    pool: &PgPool,
    trip_id: TripId,
    users: &[String],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM trip_visible_users WHERE trip_id = $1")
        .bind(trip_id)
        .execute(&mut *tx)
        .await?;
    for uid in users {
        sqlx::query("INSERT INTO trip_visible_users (trip_id, user_id) VALUES ($1, $2)")
            .bind(trip_id)
            .bind(uid)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await
}

pub async fn replace_visible_groups(
    pool: &PgPool,
    trip_id: TripId,
    groups: &[i64],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM trip_visible_groups WHERE trip_id = $1")
        .bind(trip_id)
        .execute(&mut *tx)
        .await?;
    for gid in groups {
        sqlx::query("INSERT INTO trip_visible_groups (trip_id, group_id) VALUES ($1, $2)")
            .bind(trip_id)
            .bind(gid)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await
}
