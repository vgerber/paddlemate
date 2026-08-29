//! Image files on disk. Uploads are decoded and re-encoded rather than
//! stored as received: that strips EXIF (phone photos carry GPS), caps the
//! stored size, and guarantees the bytes really are an image whatever the
//! request claimed. Only metadata goes to the database, so a dump stays
//! small and the store can move behind `storage_key` later.

use std::io::Cursor;
use std::path::{Path, PathBuf};

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

/// Reject keys that could escape the media directory.
pub fn is_safe_key(key: &str) -> bool {
    !key.is_empty()
        && !key.contains("..")
        && !key.contains('/')
        && !key.contains('\\')
        && Path::new(key).file_name().is_some_and(|name| name == key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumb_key_sits_beside_the_original() {
        assert_eq!(thumb_key("abc.jpg"), "abc.thumb.jpg");
        assert_eq!(thumb_key("noext"), "noext.thumb");
    }

    #[test]
    fn rejects_keys_that_escape_the_directory() {
        assert!(is_safe_key("abc.jpg"));
        assert!(!is_safe_key("../secrets"));
        assert!(!is_safe_key("nested/abc.jpg"));
        assert!(!is_safe_key(""));
    }

    #[tokio::test]
    async fn rejects_bytes_that_are_not_an_image() {
        assert!(store_image(b"definitely not a picture").await.is_err());
    }
}
