use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

pub const API_TOKEN_PREFIX: &str = "pm_";

/// 256 random bits as hex: the secret in an API token or an invite link.
pub fn generate_token() -> String {
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

pub struct CreatedToken {
    pub id: i64,
    pub created_at: DateTime<Utc>,
}

pub struct TokenRow {
    pub id: i64,
    pub user_id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

pub async fn insert_token(
    pool: &PgPool,
    user_id: &str,
    name: &str,
    token_hash: &str,
    expires_at: Option<DateTime<Utc>>,
) -> Result<CreatedToken, sqlx::Error> {
    let r = sqlx::query!(
        r#"
        INSERT INTO api_tokens (user_id, name, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at
        "#,
        user_id,
        name,
        token_hash,
        expires_at
    )
    .fetch_one(pool)
    .await?;
    Ok(CreatedToken {
        id: r.id,
        created_at: r.created_at,
    })
}

pub async fn list_active(pool: &PgPool, user_id: &str) -> Result<Vec<TokenRow>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT id, user_id, name, created_at, expires_at, last_used_at, revoked_at
        FROM api_tokens
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC
        "#,
        user_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| TokenRow {
            id: r.id,
            user_id: r.user_id,
            name: r.name,
            created_at: r.created_at,
            expires_at: r.expires_at,
            last_used_at: r.last_used_at,
            revoked_at: r.revoked_at,
        })
        .collect())
}

/// Returns false when no active token of the user has this id.
pub async fn revoke(pool: &PgPool, token_id: i64, user_id: &str) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!(
        r#"
        UPDATE api_tokens
        SET revoked_at = NOW()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        "#,
        token_id,
        user_id
    )
    .execute(pool)
    .await?;
    Ok(res.rows_affected() > 0)
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
