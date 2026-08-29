//! Image files on disk. Uploads are decoded and re-encoded rather than
//! stored as received: that strips EXIF (phone photos carry GPS), caps the
//! stored size, and guarantees the bytes really are an image whatever the
//! request claimed. Only metadata goes to the database, so a dump stays
//! small and the store can move behind `storage_key` later.

use std::io::Cursor;
use std::path::PathBuf;

use image::ImageFormat;

/// Largest upload accepted, before decoding.
pub const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024;
/// Longest edge kept for the display copy.
const MAX_EDGE: u32 = 1600;
/// Longest edge of the thumbnail used in lists and galleries.
const THUMB_EDGE: u32 = 400;
/// Re-encode quality for the stored JPEG.
const JPEG_QUALITY: u8 = 82;

pub struct StoredImage {
    pub storage_key: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub byte_size: u64,
}

/// Where uploads are written. A relative default keeps development working
/// without configuration; production mounts a volume and sets MEDIA_DIR.
pub fn media_dir() -> PathBuf {
    PathBuf::from(std::env::var("MEDIA_DIR").unwrap_or_else(|_| "media".to_string()))
}

/// The thumbnail that belongs to a stored key.
pub fn thumb_key(storage_key: &str) -> String {
    match storage_key.rsplit_once('.') {
        Some((stem, ext)) => format!("{stem}.thumb.{ext}"),
        None => format!("{storage_key}.thumb"),
    }
}

/// Public path for a stored key, as served by the media route.
pub fn url_for(storage_key: &str) -> String {
    format!("/media/{storage_key}")
}

/// Decode `bytes`, re-encode a display copy and a thumbnail, and write both
/// under `media_dir()`. Fails when the bytes are not a supported image.
pub async fn store_image(bytes: &[u8]) -> anyhow::Result<StoredImage> {
    let decoded = image::load_from_memory(bytes)
        .map_err(|_| anyhow::anyhow!("not a readable image (jpeg, png or webp)"))?;

    let display = if decoded.width().max(decoded.height()) > MAX_EDGE {
        decoded.resize(MAX_EDGE, MAX_EDGE, image::imageops::FilterType::Lanczos3)
    } else {
        decoded
    };
    // Only ever shrink: resizing to the box would blow a small image up to
    // 400px, making the "thumbnail" larger than the picture it stands for.
    let thumb = if display.width().max(display.height()) > THUMB_EDGE {
        display.resize(
            THUMB_EDGE,
            THUMB_EDGE,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        display.clone()
    };

    // One stored format keeps serving simple; photos are what this is for.
    let display_rgb = display.to_rgb8();
    let thumb_rgb = thumb.to_rgb8();
    let mut display_bytes = Cursor::new(Vec::new());
    let mut thumb_bytes = Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut display_bytes, JPEG_QUALITY)
        .encode_image(&display_rgb)?;
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut thumb_bytes, JPEG_QUALITY)
        .encode_image(&thumb_rgb)?;
    let display_bytes = display_bytes.into_inner();
    let thumb_bytes = thumb_bytes.into_inner();

    let storage_key = format!("{}.jpg", uuid::Uuid::new_v4());
    let dir = media_dir();
    tokio::fs::create_dir_all(&dir).await?;
    tokio::fs::write(dir.join(&storage_key), &display_bytes).await?;
    tokio::fs::write(dir.join(thumb_key(&storage_key)), &thumb_bytes).await?;

    Ok(StoredImage {
        storage_key,
        mime_type: ImageFormat::Jpeg.to_mime_type().to_string(),
        width: display_rgb.width(),
        height: display_rgb.height(),
        byte_size: display_bytes.len() as u64,
    })
}

/// Remove a stored image and its thumbnail. A missing file is not an error:
/// the row is what matters, and a half-deleted pair must still go away.
pub async fn delete_image(storage_key: &str) {
    let dir = media_dir();
    for key in [storage_key.to_string(), thumb_key(storage_key)] {
        if let Err(err) = tokio::fs::remove_file(dir.join(&key)).await {
            if err.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!("Could not delete media file {key}: {err}");
            }
        }
    }
}

/// Delete files under MEDIA_DIR that no row points at any more.
///
/// The database is the source of truth and the filesystem is reconciled to
/// it, which covers every way the two can drift: a delete trigger that only
/// knows about rows, a crash between writing a file and inserting its row,
/// or a row removed by hand. Files younger than `MIN_ORPHAN_AGE` are left
/// alone so an upload in flight is never swept out from under itself.
pub async fn sweep_orphans(pool: &sqlx::PgPool) -> anyhow::Result<usize> {
    /// An upload writes its files before inserting the row; anything newer
    /// than this may simply not have got there yet.
    const MIN_ORPHAN_AGE: std::time::Duration = std::time::Duration::from_secs(15 * 60);

    let known: std::collections::HashSet<String> = sqlx::query_scalar::<_, String>(
        "SELECT storage_key FROM media WHERE storage_key IS NOT NULL",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .flat_map(|key| [thumb_key(&key), key])
    .collect();

    let dir = media_dir();
    let mut entries = match tokio::fs::read_dir(&dir).await {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(err) => return Err(err.into()),
    };

    let mut removed = 0;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        if known.contains(&name) {
            continue;
        }
        let too_young = entry
            .metadata()
            .await
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age < MIN_ORPHAN_AGE);
        if too_young {
            continue;
        }
        if let Err(err) = tokio::fs::remove_file(entry.path()).await {
            tracing::warn!("Could not sweep orphaned media file {name}: {err}");
        } else {
            removed += 1;
        }
    }
    if removed > 0 {
        tracing::info!("Swept {removed} orphaned media file(s)");
    }
    Ok(removed)
}

/// Run the sweep on start and daily after that.
pub fn run_sweeper(pool: sqlx::PgPool) {
    tokio::spawn(async move {
        loop {
            if let Err(err) = sweep_orphans(&pool).await {
                tracing::error!("Media sweep failed: {err}");
            }
            tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumb_key_sits_beside_the_original() {
        assert_eq!(thumb_key("abc.jpg"), "abc.thumb.jpg");
        assert_eq!(thumb_key("noext"), "noext.thumb");
    }

    #[tokio::test]
    async fn rejects_bytes_that_are_not_an_image() {
        assert!(store_image(b"definitely not a picture").await.is_err());
    }
}
