use sqlx::PgConnection;

use super::{EntityKind, Scope, snapshot::State};
use crate::models::history::{HistoryChange, StepKind};

/// Most fields one step lists. Matches the table's check constraint.
pub const MAX_CHANGES: usize = 32;
/// Longest before/after text kept; longer values are cut.
pub const MAX_VALUE_CHARS: usize = 200;

/// Fields shown first, in this order; the rest follow alphabetically.
const FIELD_ORDER: [&str; 6] = [
    "name",
    "feature_type",
    "description",
    "country",
    "regions",
    "location",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Op {
    Create,
    Edit,
    Delete,
}

/// A proposal that was accepted, and who accepted it.
#[derive(Debug, Clone, Copy)]
pub struct Accepted<'a> {
    pub proposal_id: i64,
    pub reviewer_id: &'a str,
}

/// Who made a change and by which route: directly, or through a proposal
/// (then the actor is the submitter).
#[derive(Debug, Clone, Copy)]
pub struct Via<'a> {
    pub actor: &'a str,
    pub proposal: Option<Accepted<'a>>,
}

impl<'a> Via<'a> {
    pub fn direct(actor: &'a str) -> Self {
        Via {
            actor,
            proposal: None,
        }
    }

    pub fn proposal(submitter: &'a str, proposal_id: i64, reviewer_id: &'a str) -> Self {
        Via {
            actor: submitter,
            proposal: Some(Accepted {
                proposal_id,
                reviewer_id,
            }),
        }
    }

    fn kind(&self, op: Op) -> StepKind {
        match (op, self.proposal.is_some()) {
            (Op::Delete, _) => StepKind::Deleted,
            (Op::Create, false) => StepKind::Created,
            (Op::Edit, false) => StepKind::Edited,
            (_, true) => StepKind::ProposalAccepted,
        }
    }
}

fn clip(value: &str) -> String {
    if value.chars().count() <= MAX_VALUE_CHARS {
        return value.to_string();
    }
    let mut cut: String = value.chars().take(MAX_VALUE_CHARS - 3).collect();
    cut.push_str("...");
    cut
}

fn shown(field: &str, value: Option<&String>) -> Option<String> {
    // A geometry has no short display form.
    if field == "location" {
        return None;
    }
    value.map(|v| clip(v))
}

/// The fields that differ between two states, bounded in count and size.
pub fn diff(before: &State, after: &State) -> Vec<HistoryChange> {
    let mut fields: Vec<&String> = before
        .keys()
        .chain(after.keys())
        .filter(|k| before.get(*k) != after.get(*k))
        .collect();
    fields.sort();
    fields.dedup();
    fields.sort_by_key(|f| {
        FIELD_ORDER
            .iter()
            .position(|o| o == f)
            .unwrap_or(FIELD_ORDER.len())
    });
    fields
        .into_iter()
        .take(MAX_CHANGES)
        .map(|f| HistoryChange {
            field: clip(f),
            before: shown(f, before.get(f)),
            after: shown(f, after.get(f)),
        })
        .collect()
}

/// Write one step. Call it on the connection of the transaction that makes the
/// change, so the step and the change land together or not at all.
///
/// An edit that changed nothing writes no step. A delete lists no fields and a
/// create has no `before`.
pub async fn record(
    conn: &mut PgConnection,
    scope: &Scope,
    op: Op,
    via: &Via<'_>,
    before: &State,
    after: &State,
) -> Result<(), sqlx::Error> {
    let changes = match op {
        Op::Delete => Vec::new(),
        Op::Create => diff(&State::new(), after),
        Op::Edit => diff(before, after),
    };
    if op == Op::Edit && changes.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO entity_history \
         (entity_kind, entity_id, waterway_id, section_id, kind, actor_id, proposal_id, \
          reviewer_id, changes) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(scope.kind.as_str())
    .bind(scope.id)
    .bind(scope.waterway_id)
    .bind(scope.section_id)
    .bind(via.kind(op).as_str())
    .bind(via.actor)
    .bind(via.proposal.map(|p| p.proposal_id))
    .bind(via.proposal.map(|p| p.reviewer_id))
    .bind(sqlx::types::Json(&changes))
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Write a `deleted` step for every section and feature that goes with the
/// entity (its section's features, a river's sections and their features).
/// Call it before the delete, while the children can still be found.
pub async fn record_children(
    conn: &mut PgConnection,
    scope: &Scope,
    via: &Via<'_>,
) -> Result<(), sqlx::Error> {
    const COLS: &str = "(entity_kind, entity_id, waterway_id, section_id, kind, actor_id, \
                        proposal_id, reviewer_id)";
    let (sections_of, features_of) = match scope.kind {
        EntityKind::Feature => return Ok(()),
        EntityKind::Waterway => (
            Some("FROM water_sections s WHERE s.waterway_id = $1"),
            "FROM features f JOIN water_sections s ON s.id = f.section_id \
             WHERE s.waterway_id = $1",
        ),
        EntityKind::Section => (
            None,
            "FROM features f JOIN water_sections s ON s.id = f.section_id WHERE s.id = $1",
        ),
    };
    let mut statements = vec![format!(
        "INSERT INTO entity_history {COLS} \
         SELECT 'feature', f.id, s.waterway_id, s.id, $2, $3, $4, $5 {features_of}"
    )];
    if let Some(from) = sections_of {
        statements.push(format!(
            "INSERT INTO entity_history {COLS} \
             SELECT 'section', s.id, s.waterway_id, s.id, $2, $3, $4, $5 {from}"
        ));
    }
    let parent = scope.id;
    for sql in statements {
        sqlx::query(&sql)
            .bind(parent)
            .bind(via.kind(Op::Delete).as_str())
            .bind(via.actor)
            .bind(via.proposal.map(|p| p.proposal_id))
            .bind(via.proposal.map(|p| p.reviewer_id))
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_clips_long_field_names() {
        let key = "k".repeat(MAX_VALUE_CHARS * 50);
        let changes = diff(&State::new(), &state(&[(&key, "v")]));
        assert_eq!(changes[0].field.chars().count(), MAX_VALUE_CHARS);
    }

    fn state(pairs: &[(&str, &str)]) -> State {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn diff_lists_changed_fields_only() {
        let before = state(&[("name", "A"), ("country", "AT")]);
        let after = state(&[("name", "B"), ("country", "AT"), ("description", "d")]);
        let changes = diff(&before, &after);
        assert_eq!(changes.len(), 2);
        assert_eq!(changes[0].field, "name");
        assert_eq!(changes[0].before.as_deref(), Some("A"));
        assert_eq!(changes[0].after.as_deref(), Some("B"));
        assert_eq!(changes[1].field, "description");
        assert_eq!(changes[1].before, None);
    }

    #[test]
    fn diff_hides_geometry_values() {
        let changes = diff(&state(&[("location", "a")]), &state(&[("location", "b")]));
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].before, None);
        assert_eq!(changes[0].after, None);
    }

    #[test]
    fn diff_cuts_long_values() {
        let long = "x".repeat(MAX_VALUE_CHARS * 3);
        let changes = diff(&State::new(), &state(&[("description", &long)]));
        assert_eq!(
            changes[0].after.as_deref().unwrap().chars().count(),
            MAX_VALUE_CHARS
        );
    }

    #[test]
    fn diff_caps_the_field_count() {
        let many: State = (0..MAX_CHANGES * 2)
            .map(|i| (format!("f{i:03}"), "v".to_string()))
            .collect();
        assert_eq!(diff(&State::new(), &many).len(), MAX_CHANGES);
    }

    #[test]
    fn diff_reports_a_removed_field() {
        let changes = diff(&state(&[("country", "AT")]), &State::new());
        assert_eq!(changes[0].after, None);
        assert_eq!(changes[0].before.as_deref(), Some("AT"));
    }
}
