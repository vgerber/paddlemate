use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Who may see a record. Shared by descents and trips.
/// For `shared`, the audience (users and groups) is embedded directly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Visibility {
    Private,
    Public,
    Shared {
        #[serde(default)]
        users: Vec<String>,
        #[serde(default)]
        groups: Vec<i64>,
    },
}

impl Visibility {
    pub fn scope_str(&self) -> &'static str {
        match self {
            Visibility::Private => "private",
            Visibility::Public => "public",
            Visibility::Shared { .. } => "shared",
        }
    }
}
