use sha2::{Digest, Sha256};

pub const API_TOKEN_PREFIX: &str = "pm_";

fn generate_token() -> String {
    use std::fmt::Write;
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("Failed to generate random bytes");
    let mut token = String::with_capacity(64);
    for byte in bytes {
        write!(&mut token, "{byte:02x}").unwrap();
    }
    token
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let result = hasher.finalize();
    format!("{result:x}")
}

pub fn generate_token_pair() -> (String, String) {
    let plain_token = format!("{}{}", API_TOKEN_PREFIX, generate_token());
    let token_hash = hash_token(&plain_token);
    (plain_token, token_hash)
}

#[cfg(test)]
mod tests {
    use super::{API_TOKEN_PREFIX, generate_token_pair, hash_token};

    #[test]
    fn hashing_is_stable_and_hex_encoded() {
        // The fixture in .claude/skills/test-data depends on this exact value.
        assert_eq!(
            hash_token("pm_testtoken123"),
            "ffd2e7ff161f619163861f2870c0fdf91508ae8851743d855d2661aa13738ec8"
        );
    }

    #[test]
    fn pairs_are_prefixed_unique_and_never_stored_in_the_clear() {
        let (plain, hash) = generate_token_pair();
        let (other_plain, _) = generate_token_pair();

        assert!(plain.starts_with(API_TOKEN_PREFIX));
        assert_ne!(plain, other_plain, "tokens must not repeat");
        assert_eq!(hash, hash_token(&plain));
        assert!(!hash.contains(&plain), "the hash must not embed the token");
        assert_eq!(hash.len(), 64);
    }
}
