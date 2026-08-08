# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM rust:1.88.0 AS builder

WORKDIR /app

# Cache dependencies by copying manifests first
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY river-gauge/Cargo.toml river-gauge/Cargo.toml

# Dummy src so cargo can resolve the workspace
RUN mkdir -p src river-gauge/src \
    && echo "fn main() {}" > src/main.rs \
    && echo "" > river-gauge/src/lib.rs \
    && SQLX_OFFLINE=true cargo build --release \
    && rm -rf src river-gauge/src

# Now copy real source and build
COPY . .
RUN touch src/main.rs river-gauge/src/lib.rs \
    && SQLX_OFFLINE=true cargo build --release

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/paddlemate_api /usr/local/bin/paddlemate_api
# Operational tool: refreshes gauge/source data from a Rivermap snapshot
# (docker cp the snapshot in, then docker exec import_rivermap --snapshot ...).
# Shipped in the image because the DB is only reachable from this network.
COPY --from=builder /app/target/release/import_rivermap /usr/local/bin/import_rivermap
# Operational tool: syncs the multi-provider gauge discovery catalog from each
# reader's live list_stations(). Run on a schedule: docker exec sync_gauge_catalog.
COPY --from=builder /app/target/release/sync_gauge_catalog /usr/local/bin/sync_gauge_catalog

ENV PORT=3000
EXPOSE 3000

CMD ["paddlemate_api"]
