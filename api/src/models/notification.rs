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
