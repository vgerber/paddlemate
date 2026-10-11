//! History of rivers, sections and features: one `entity_history` row per
//! step, written in the same transaction as the change it describes.
//!
//! Retention: the history is the audit trail, so it is kept for as long as the
//! data it explains. There is no cleanup job and no cascade from the entity; a
//! deleted feature's history stays readable. Each step is bounded instead (see
//! `record::MAX_CHANGES` and `record::MAX_VALUE_CHARS`).

mod read;
mod record;
mod snapshot;

pub use read::{entity_has_steps, list_steps, list_waterway_sources};
pub use record::{Op, Via, diff, record};
pub use snapshot::{State, scope_of, snapshot};

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
