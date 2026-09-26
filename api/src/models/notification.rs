use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{trip::TripId, user::UserId};

pub type TripEventId = i64;
pub type PushSubscriptionId = i64;

/// What changed on a trip. The kind decides where a change is announced:
/// every kind refreshes open apps live, `in_inbox` puts it under the bell,
/// and `pushes` buzzes a phone.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "trip_event_kind", rename_all = "snake_case")]
pub enum TripEventKind {
    TripChanged,
    MemberJoined,
    MemberLeft,
    MemberRemoved,
    AttendanceChanged,
    StayAdded,
    StayChanged,
    StayRemoved,
    WatchListChanged,
    CandidateProposed,
    CandidateChanged,
    CandidateVoted,
    CandidateAccepted,
    CandidateWithdrawn,
    LogLinked,
}

impl TripEventKind {
    /// Votes and small corrections to a suggestion only refresh live: a week
    /// of voting would bury everything else under the bell.
    pub fn in_inbox(self) -> bool {
        !matches!(self, Self::CandidateVoted | Self::CandidateChanged)
    }

    /// Who is on the trip changed: live streams re-read their trips.
    pub fn changes_membership(self) -> bool {
        matches!(
            self,
            Self::MemberJoined | Self::MemberLeft | Self::MemberRemoved
        )
    }

    /// Decisions and plans buzz a phone; votes, corrections, watch-list edits
    /// and logs do not. Agreed with the product owner, 2026-09.
    pub fn pushes(self) -> bool {
        !matches!(
            self,
            Self::CandidateVoted
                | Self::CandidateChanged
                | Self::WatchListChanged
                | Self::LogLinked
        )
    }
}

/// What a change was about, named as it was when it happened: a removed base
/// keeps its name here after its row is gone. Only the fields that kind uses
/// are set.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct EventSummary {
    /// The thing changed: a base, a candidate, a log, the trip itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Somebody other than the actor: who was added or removed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    /// For attendance: the dates and hours now set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arrival: Option<NaiveDate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arrival_time: Option<NaiveTime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub departure: Option<NaiveDate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub departure_time: Option<NaiveTime>,
}

impl EventSummary {
    /// About a named thing: a base, a candidate, a log, the trip.
    pub fn named(name: impl Into<String>) -> Self {
        Self {
            name: Some(name.into()),
            ..Default::default()
        }
    }

    /// About somebody other than the actor.
    pub fn about(username: impl Into<String>) -> Self {
        Self {
            username: Some(username.into()),
            ..Default::default()
        }
    }
}

/// One change, as the bell lists it.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct TripEvent {
    pub id: TripEventId,
    pub trip_id: TripId,
    pub trip_name: String,
    /// Absent when the account that made the change is gone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_id: Option<UserId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_username: Option<String>,
    pub kind: TripEventKind,
    pub summary: EventSummary,
    pub created_at: DateTime<Utc>,
    /// Newer than the caller's read mark.
    pub unread: bool,
    /// The change in one line, e.g. "mara proposed Haus Wildspitze" - the same
    /// words a push says, so clients show this rather than composing their own.
    pub text: String,
}

/// What the live stream carries: enough to know what to refresh, nothing to
/// render - the app refetches what it shows.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LiveEvent {
    pub id: TripEventId,
    pub trip_id: TripId,
    pub kind: TripEventKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_id: Option<UserId>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct NotificationState {
    pub unread_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_until: Option<DateTime<Utc>>,
    /// The server's VAPID key, for `PushManager.subscribe`. Absent when this
    /// server does not send push.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub push_public_key: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct MarkReadRequest {
    /// Everything up to and including this moment is read.
    pub read_until: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct PushSubscription {
    pub id: PushSubscriptionId,
    pub endpoint: String,
    pub created_at: DateTime<Utc>,
}

/// The browser's `PushSubscription.toJSON()`, as it comes.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreatePushSubscriptionRequest {
    pub endpoint: String,
    pub keys: PushSubscriptionKeys,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PushSubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

/// One line for a change, as the trip's other members read it: on a phone's
/// lock screen and under the bell alike, so the two cannot say different
/// things.
pub fn describe(kind: TripEventKind, actor: &str, s: &EventSummary) -> String {
    use TripEventKind::*;
    let name = s.name.as_deref().unwrap_or("a base");
    let who = s.username.as_deref().unwrap_or("someone");
    match kind {
        TripChanged => format!("{actor} changed the trip"),
        MemberJoined if s.username.is_some() => format!("{actor} added {who}"),
        MemberJoined => format!("{actor} joined the trip"),
        MemberLeft => format!("{actor} left the trip"),
        MemberRemoved => format!("{actor} removed {who}"),
        AttendanceChanged => match (s.arrival, s.departure) {
            (Some(a), _) => format!("{actor} arrives {}", a.format("%a %d %b")),
            (None, Some(d)) => format!("{actor} leaves {}", d.format("%a %d %b")),
            (None, None) => format!("{actor} changed when they are coming"),
        },
        StayAdded => format!("{actor} added {name}"),
        StayChanged => format!("{actor} changed {name}"),
        StayRemoved => format!("{actor} removed {name}"),
        WatchListChanged => format!("{actor} changed the runs watched from {name}"),
        CandidateProposed => format!("{actor} proposed {name}"),
        CandidateChanged => format!("{actor} edited {name}"),
        CandidateVoted => format!("{actor} voted on {name}"),
        CandidateAccepted => format!("{actor} made {name} a base"),
        CandidateWithdrawn => format!("{actor} withdrew {name}"),
        LogLinked => format!("{actor} logged {}", s.name.as_deref().unwrap_or("a run")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn a_log_without_a_name_is_a_run() {
        let none = EventSummary::default();
        assert_eq!(
            describe(TripEventKind::LogLinked, "tobi", &none),
            "tobi logged a run"
        );
        assert_eq!(
            describe(TripEventKind::StayAdded, "tobi", &none),
            "tobi added a base"
        );
    }

    #[test]
    fn describes_a_base_by_name() {
        let s = EventSummary {
            name: Some("Haus Wildspitze".into()),
            ..Default::default()
        };
        assert_eq!(
            describe(TripEventKind::CandidateProposed, "mara", &s),
            "mara proposed Haus Wildspitze"
        );
        assert_eq!(
            describe(TripEventKind::CandidateAccepted, "vincent", &s),
            "vincent made Haus Wildspitze a base"
        );
    }

    #[test]
    fn tells_joining_from_being_added() {
        let none = EventSummary::default();
        let tobi = EventSummary {
            username: Some("tobi".into()),
            ..Default::default()
        };
        assert_eq!(
            describe(TripEventKind::MemberJoined, "eve", &none),
            "eve joined the trip"
        );
        assert_eq!(
            describe(TripEventKind::MemberJoined, "mara", &tobi),
            "mara added tobi"
        );
    }

    #[test]
    fn says_when_someone_arrives() {
        let s = EventSummary {
            arrival: NaiveDate::from_ymd_opt(2026, 9, 22),
            ..Default::default()
        };
        assert_eq!(
            describe(TripEventKind::AttendanceChanged, "tobi", &s),
            "tobi arrives Tue 22 Sep"
        );
    }

    #[test]
    fn votes_stay_quiet_and_plans_push() {
        assert!(!TripEventKind::CandidateVoted.pushes());
        assert!(!TripEventKind::CandidateVoted.in_inbox());
        assert!(!TripEventKind::WatchListChanged.pushes());
        assert!(TripEventKind::WatchListChanged.in_inbox());
        assert!(TripEventKind::StayRemoved.pushes());
        assert!(TripEventKind::AttendanceChanged.pushes());
    }
}
