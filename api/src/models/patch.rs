use serde::{Deserialize, Deserializer};

/// Deserializer for a patch field that distinguishes "omitted" from "set to
/// null". Plain `#[serde(default)]` on an `Option<Option<T>>` cannot: an
/// explicit `null` deserializes to the outer `None`, so the field reads as
/// omitted and never clears. Pair it with `#[serde(default)]`, which still
/// supplies the `None` when the key is absent.
pub fn nullable<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::deserialize(deserializer).map(Some)
}
