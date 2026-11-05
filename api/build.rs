// Rebuild when a migration is added: sqlx::migrate! embeds them at compile
// time, and cargo does not watch the folder on its own.
fn main() {
    println!("cargo:rerun-if-changed=migrations");
}
