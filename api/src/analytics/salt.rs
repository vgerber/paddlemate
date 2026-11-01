//! The caller hash. The salt is random, lives only in memory and is replaced
//! when the UTC day changes, so a caller cannot be followed across days and
//! the hash cannot be reversed after a restart.

use std::{net::IpAddr, sync::Mutex};

use chrono::NaiveDate;
use sha2::{Digest, Sha256};

pub struct DailySalt {
    current: Mutex<(Option<NaiveDate>, [u8; 32])>,
}

impl Default for DailySalt {
    fn default() -> Self {
        Self::new()
    }
}

impl DailySalt {
    pub fn new() -> Self {
        Self {
            current: Mutex::new((None, [0; 32])),
        }
    }

    /// 16 hex characters of SHA-256(salt, address, user agent).
    pub fn caller(&self, day: NaiveDate, ip: IpAddr, ua: &str) -> String {
        let salt = {
            let mut cur = self.current.lock().unwrap_or_else(|e| e.into_inner());
            if cur.0 != Some(day) {
                let mut fresh = [0u8; 32];
                getrandom::fill(&mut fresh).expect("random bytes");
                *cur = (Some(day), fresh);
            }
            cur.1
        };
        let mut hasher = Sha256::new();
        hasher.update(salt);

        hasher.update(ip.to_string().as_bytes());
        hasher.update([0]);
        hasher.update(ua.as_bytes());
        hasher.finalize()[..8]
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, d).unwrap()
    }

    #[test]
    fn same_caller_same_day_shares_a_hash() {
        let salt = DailySalt::new();
        let ip: IpAddr = "203.0.113.7".parse().unwrap();
        let a = salt.caller(day(1), ip, "curl/8");
        assert_eq!(a, salt.caller(day(1), ip, "curl/8"));
        assert_eq!(a.len(), 16);
        assert_ne!(
            a,
            salt.caller(day(1), "203.0.113.8".parse().unwrap(), "curl/8")
        );
        assert_ne!(a, salt.caller(day(1), ip, "other"));
    }

    #[test]
    fn a_new_day_changes_the_hash() {
        let salt = DailySalt::new();
        let ip: IpAddr = "203.0.113.7".parse().unwrap();
        let before = salt.caller(day(1), ip, "ua");
        assert_ne!(before, salt.caller(day(2), ip, "ua"));
    }

    #[test]
    fn hash_hides_the_address() {
        let salt = DailySalt::new();
        let hash = salt.caller(day(1), "203.0.113.7".parse().unwrap(), "ua");
        assert!(!hash.contains("203"));
    }
}
