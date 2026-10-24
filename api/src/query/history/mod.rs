//! History of rivers, sections and features: one `entity_history` row per
//! step, written in the same transaction as the change it describes.
//!
//! Retention: the history is the audit trail and is kept for as long as the
//! data it explains. A deleted entity's history stays readable (also when the
//! river or section it hung off was deleted; that delete records a step for
//! each child) for `KEEP_DELETED_DAYS`, then `run_pruner` removes it. There is
//! no cascade from the entity. Each step is bounded (see `record::MAX_CHANGES`
//! and `record::MAX_VALUE_CHARS`).

mod deleted;
mod read;
mod record;
mod retention;
mod snapshot;
mod track;

pub use deleted::list_deleted_features;
pub use read::{is_known, list_feature_steps, list_steps, list_waterway_sources};
pub use record::{Op, Via, diff, record};
pub use retention::{KEEP_DELETED_DAYS, purge_deleted, run_pruner};
pub use snapshot::{State, scope_of, snapshot};
pub use track::{tracked_delete, tracked_edit};

/// The kind of entity a history belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntityKind {
    Waterway,
    Section,
    Feature,
}

impl EntityKind {
    pub fn as_str(self) -> &'static str {
        match self {
            EntityKind::Waterway => "waterway",
            EntityKind::Section => "section",
            EntityKind::Feature => "feature",
        }
    }
}

/// An entity together with the parents a lookup is scoped by.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Scope {
    pub kind: EntityKind,
    pub id: i64,
    pub waterway_id: i64,
    /// Set for sections and features.
    pub section_id: Option<i64>,
}

impl Scope {
    pub fn waterway(id: i64) -> Self {
        Scope {
            kind: EntityKind::Waterway,
            id,
            waterway_id: id,
            section_id: None,
        }
    }

    pub fn section(waterway_id: i64, id: i64) -> Self {
        Scope {
            kind: EntityKind::Section,
            id,
            waterway_id,
            section_id: Some(id),
        }
    }

    pub fn feature(waterway_id: i64, section_id: i64, id: i64) -> Self {
        Scope {
            kind: EntityKind::Feature,
            id,
            waterway_id,
            section_id: Some(section_id),
        }
    }
}
