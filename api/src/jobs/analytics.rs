//! Ships analytics events to ClickHouse in batches.
//!
//! One task, one insert at a time, so memory stays at the queue plus one
//! batch. A failed insert drops the batch with a warning; requests never wait.

use std::time::Duration;

use tokio::{sync::mpsc, time::Instant};

use crate::{analytics::Event, config::AnalyticsSettings};

pub const BATCH_ROWS: usize = 1000;
pub const BATCH_WAIT: Duration = Duration::from_secs(5);
const TIMEOUT: Duration = Duration::from_secs(10);

/// Schema files in order; a later change is a new numbered file.
const SCHEMA: &[&str] = &[include_str!("../../analytics/0001_events.sql")];

const COLUMNS: &str =
    "ts, route, method, status, latency_ms, client, caller, ua_family, query, bytes";

pub fn run(settings: AnalyticsSettings, rx: mpsc::Receiver<Event>) {
    tokio::spawn(ingest(settings, rx));
}

struct Ingest {
    http: reqwest::Client,
    settings: AnalyticsSettings,
    schema_ready: bool,
}

impl Ingest {
    async fn post(&self, query: Option<&str>, body: String) -> Result<(), String> {
        let mut req = self.http.post(&self.settings.url).body(body);
        if let Some(query) = query {
            req = req.query(&[("query", query)]);
        }
        if let Some(user) = &self.settings.user {
            req = req.basic_auth(user, self.settings.password.as_deref());
        }
        let res = req.send().await.map_err(|e| e.without_url().to_string())?;
        if res.status().is_success() {
            return Ok(());
        }
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        Err(format!(
            "{status}: {}",
            text.chars().take(200).collect::<String>()
        ))
    }

    async fn apply_schema(&mut self) {
        for file in SCHEMA {
            let sql = file.replace("{database}", &self.settings.database);
            for stmt in sql.split(';').map(str::trim).filter(|s| !s.is_empty()) {
                if let Err(err) = self.post(None, stmt.to_string()).await {
                    tracing::warn!("Analytics schema not applied: {err}");
                    return;
                }
            }
        }
        self.schema_ready = true;
    }

    async fn flush(&mut self, batch: &mut Vec<Event>) {
        if batch.is_empty() {
            return;
        }
        if !self.schema_ready {
            self.apply_schema().await;
        }
        let mut body = String::new();
        for event in batch.iter() {
            if let Ok(line) = serde_json::to_string(event) {
                body.push_str(&line);
                body.push('\n');
            }
        }
        let query = format!(
            "INSERT INTO {}.api_events ({COLUMNS}) FORMAT JSONEachRow",
            self.settings.database
        );
        if let Err(err) = self.post(Some(&query), body).await {
            tracing::warn!(
                "Analytics insert failed, dropped {} events: {err}",
                batch.len()
            );
            crate::analytics::dropped(batch.len() as u64);
        }
        batch.clear();
    }
}

async fn ingest(settings: AnalyticsSettings, mut rx: mpsc::Receiver<Event>) {
    let http = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .expect("http client");
    let mut job = Ingest {
        http,
        settings,
        schema_ready: false,
    };
    job.apply_schema().await;
    let mut batch = Vec::with_capacity(BATCH_ROWS);
    while let Some(first) = rx.recv().await {
        batch.push(first);
        let deadline = Instant::now() + BATCH_WAIT;
        while batch.len() < BATCH_ROWS {
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Ok(Some(event)) => batch.push(event),
                _ => break,
            }
        }
        job.flush(&mut batch).await;
    }
}
