use sha2::{Digest, Sha256};

pub const API_TOKEN_PREFIX: &str = "pm_";

fn generate_token() -> String {
    use std::fmt::Write;
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("Failed to generate random bytes");
    let mut token = String::with_capacity(64);
    for byte in bytes {
        write!(&mut token, "{:02x}", byte).unwrap();
    }
    token
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

pub fn generate_token_pair() -> (String, String) {
    let plain_token = format!("{}{}", API_TOKEN_PREFIX, generate_token());
    let token_hash = hash_token(&plain_token);
    (plain_token, token_hash)
}
