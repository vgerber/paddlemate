use std::sync::Arc;

use aide::{
    axum::{ApiRouter, IntoApiResponse, routing::get},
    openapi::OpenApi,
    transform::TransformOpenApi,
};
use axum::http::HeaderValue;
use axum::response::IntoResponse;
use axum::{Extension, middleware};
use axum_keycloak_auth::{
    Url,
    decode::ProfileAndEmail,
    instance::{KeycloakAuthInstance, KeycloakConfig},
    layer::KeycloakAuthLayer,
};
use indexmap::IndexMap;
use moka::future::Cache;
use paddlemate_api::{
    error::ApiError,
    layers::auth::{api_token_auth, api_token_auth_optional},
    routes::{
        descents::descents_routes, docs::docs_routes, gauges::gauges_routes, geo::geo_routes,
        groups::group_routes, proposals::proposals_routes, users::users_routes,
        waterways::waterways_routes,
    },
    state::{AppState, KeycloakState},
};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderName};
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;
use tower_governor::{
    GovernorLayer, errors::GovernorError, governor::GovernorConfigBuilder,
    key_extractor::SmartIpKeyExtractor,
};
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    trace::TraceLayer,
};

async fn index() -> impl IntoApiResponse {
    "Welcome to the Paddlemate API"
}

fn api_docs(api: TransformOpenApi) -> TransformOpenApi {
    api.title("Paddlemate API")
        .summary("Paddlemate platform")
        .description("API for managing the Paddlemate platform")
        .server(aide::openapi::Server {
            url: String::new(),
            description: Some("API Server".to_string()),
            ..Default::default()
        })
        .security_scheme(
            "Bearer",
            aide::openapi::SecurityScheme::OAuth2 {
                flows: aide::openapi::OAuth2Flows {
                    implicit: None,
                    password: Some(aide::openapi::OAuth2Flow::Password {
                        refresh_url: None,
                        token_url: dotenvy::var("KEYCLOAK_TOKEN_URL")
                            .unwrap_or_else(|_| "https://auth.example.com/realms/myrealm/protocol/openid-connect/token".to_string()),
                        scopes: IndexMap::new(),
                    }),
                    ..Default::default()
                },
                description: Some("Keycloak OAuth2 authentication".to_owned()),
                extensions: IndexMap::new(),
            },
        )
        .security_scheme(
            "ApiKey",
            aide::openapi::SecurityScheme::ApiKey {
                location: aide::openapi::ApiKeyLocation::Header,
                name: "X-Api-Key".to_string(),
                description: Some("API token for authentication".to_string()),
                extensions: IndexMap::new(),
            },
        )
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(true)
        .with_line_number(true)
        .init();

    let keycloak_url = dotenvy::var("KEYCLOAK_URL").expect("KEYCLOAK_URL not set");
    let keycloak_realm = dotenvy::var("KEYCLOAK_REALM").expect("KEYCLOAK_REALM not set");
    let keycloak_audience = dotenvy::var("KEYCLOAK_AUDIENCE").expect("KEYCLOAK_AUDIENCE not set");
    let keycloak_client_id =
        dotenvy::var("KEYCLOAK_CLIENT_ID").expect("KEYCLOAK_CLIENT_ID must be set");
    let keycloak_client_secret =
        dotenvy::var("KEYCLOAK_CLIENT_SECRET").expect("KEYCLOAK_CLIENT_SECRET must be set");

    tracing::info!("Keycloak URL: {}", keycloak_url);
    tracing::info!("Keycloak realm: {}", keycloak_realm);
    tracing::info!("Keycloak audience: {}", keycloak_audience);

    let database_url = match dotenvy::var("DATABASE_URL") {
        Ok(url) => url,
        Err(err) => {
            eprintln!("Error loading DATABASE_URL: {err}");
            return;
        }
    };

    // How close a name has to be for search to treat a misspelling as a match.
    // Only the pg_trgm operators consult this setting, and only they can use
    // the trigram indexes, so it has to be set per connection rather than
    // written into the query.
    let word_similarity_threshold = std::env::var("SEARCH_WORD_SIMILARITY_THRESHOLD")
        .ok()
        .and_then(|raw| raw.parse::<f64>().ok())
        .map(|value| value.clamp(0.0, 1.0))
        .unwrap_or(0.5);
    tracing::info!("Search word similarity threshold: {word_similarity_threshold}");

    let db = match PgPoolOptions::new()
        .max_connections(20)
        .after_connect(move |conn, _meta| {
            Box::pin(async move {
                sqlx::query(&format!(
                    "SET pg_trgm.word_similarity_threshold = {word_similarity_threshold}"
                ))
                .execute(conn)
                .await?;
                Ok(())
            })
        })
        .connect(&database_url)
        .await
    {
        Ok(pool) => pool,
        Err(err) => {
            eprintln!("Error connecting to the database: {err}");
            return;
        }
    };

    // Applying migrations on boot is convenient in development, but it ties
    // every deploy to a schema change that cannot be rolled back. Set
    // RUN_MIGRATIONS=false to run them as a separate, reviewed step instead.
    // sqlx takes an advisory lock while migrating, so several instances
    // starting at once is safe either way.
    let run_migrations = std::env::var("RUN_MIGRATIONS")
        .map(|value| value != "false")
        .unwrap_or(true);
    if run_migrations {
        sqlx::migrate!("./migrations")
            .run(&db)
            .await
            .expect("Failed to run database migrations");
    } else {
        tracing::info!("Skipping migrations (RUN_MIGRATIONS=false)");
    }

    // Comma separated list of origins allowed to call the API from a browser.
    // Unset means any origin, which suits local development and a public
    // read-only deployment; set it in production to name the web app.
    let cors_origins = match std::env::var("CORS_ALLOWED_ORIGINS") {
        Ok(raw) if !raw.trim().is_empty() => {
            let origins: Vec<_> = raw
                .split(',')
                .filter_map(|origin| origin.trim().parse::<HeaderValue>().ok())
                .collect();
            tracing::info!("CORS allowed origins: {}", raw);
            AllowOrigin::list(origins)
        }
        _ => {
            tracing::warn!("CORS_ALLOWED_ORIGINS is unset, allowing any origin");
            AllowOrigin::any()
        }
    };

    aide::generate::extract_schemas(true);

    let mut api = OpenApi::default();

    let username_cache: Cache<String, String> = Cache::builder()
        .time_to_live(Duration::from_secs(600))
        .max_capacity(10_000)
        .build();

    let state = AppState {
        pg_pool: db.clone(),
        keycloak_config: KeycloakState {
            url: keycloak_url.clone(),
            realm: keycloak_realm.clone(),
            client_id: keycloak_client_id,
            client_secret: keycloak_client_secret,
        },
        admin_token_cache: Arc::new(tokio::sync::RwLock::new(None)),
        username_cache,
        gauge_wake: Arc::new(tokio::sync::Notify::new()),
        region_wake: Arc::new(tokio::sync::Notify::new()),
    };

    let keycloak_auth_instance = Arc::new(KeycloakAuthInstance::new(
        KeycloakConfig::builder()
            .server(Url::parse(&keycloak_url).expect("Invalid Keycloak URL"))
            .realm(keycloak_realm.clone())
            .retry((5, 2))
            .build(),
    ));

    let protected = ApiRouter::new()
        .nest_api_service("/users", users_routes(state.clone()))
        .nest_api_service("/groups", group_routes(state.clone()))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            api_token_auth,
        ));

    let waterway_app = ApiRouter::new()
        .nest_api_service(
            "/waterways",
            waterways_routes(state.clone())
                .nest_api_service("/gauges", gauges_routes(state.clone())),
        )
        .nest_api_service("/descents", descents_routes(state.clone()))
        .nest_api_service("/geo", geo_routes(state.clone()))
        .nest_api_service("/proposals", proposals_routes(state.clone()))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            api_token_auth_optional,
        ));

    if dotenvy::var("DISABLE_GAUGE_READERS").ok().as_deref() != Some("true") {
        tracing::info!("Starting gauge readers");
        paddlemate_api::readers::run_all(db.clone(), state.gauge_wake.clone());
    } else {
        tracing::info!("Gauge readers disabled (DISABLE_GAUGE_READERS=true)");
    }

    paddlemate_api::regions::run_worker(db.clone(), state.region_wake.clone());
    paddlemate_api::media::run_sweeper(db.clone());

    let api_v1 = ApiRouter::new()
        .merge(protected)
        .merge(waterway_app)
        .layer(
            KeycloakAuthLayer::<String, ProfileAndEmail>::builder()
                .instance(keycloak_auth_instance.clone())
                .passthrough_mode(axum_keycloak_auth::PassthroughMode::Pass)
                .required_roles(vec![])
                .expected_audiences(vec![keycloak_audience])
                .persist_raw_claims(false)
                .build(),
        )
        .layer(Extension(keycloak_auth_instance.clone()))
        .api_route("/", get(index))
        .nest_api_service("/docs", docs_routes(state.clone()))
        .with_state(state.clone());

    let base_url = dotenvy::var("BASE_URL").unwrap_or_else(|_| "/api/v1".to_string());

    // Per-caller request budget. Anyone can submit proposals and comments, so
    // without this a single client can flood the review queue. The allowance
    // is generous enough that the map, which fires several requests per pan,
    // never notices; RATE_LIMIT_PER_SECOND=0 turns it off.
    let rate_limit_per_second = std::env::var("RATE_LIMIT_PER_SECOND")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(20);
    let rate_limiter = (rate_limit_per_second > 0).then(|| {
        tracing::info!("Rate limit: {rate_limit_per_second}/s per caller");
        GovernorLayer::new(
            GovernorConfigBuilder::default()
                // Read the caller from the proxy headers, falling back to the
                // peer address, so that everyone behind the reverse proxy is
                // not treated as one client.
                .key_extractor(SmartIpKeyExtractor)
                // per_second() sets the gap between replenished requests, not
                // the rate: passing 20 there means one request every 20
                // seconds. The interval is the reciprocal, and must not be
                // zero, so a rate above 1000/s replenishes every millisecond.
                .per_millisecond((1000 / rate_limit_per_second).max(1))
                .burst_size(rate_limit_per_second.saturating_mul(5) as u32)
                .finish()
                .expect("valid rate limit configuration"),
        )
        // Report exhaustion in the same shape as every other failure.
        .error_handler(|err| match err {
            GovernorError::TooManyRequests { wait_time, .. } => {
                ApiError::too_many_requests(format!("Too many requests, retry in {wait_time}s"))
                    .into_response()
            }
            _ => ApiError::internal().into_response(),
        })
    });

    // Uploaded photos, served straight off disk. Keys are random and a
    // stored file never changes, so they can be cached hard.
    let media_dir = paddlemate_api::media::media_dir();
    std::fs::create_dir_all(&media_dir).ok();
    tracing::info!("Serving media from {}", media_dir.display());
    let media = axum::Router::new()
        .nest_service(
            &paddlemate_api::media::media_base(),
            tower_http::services::ServeDir::new(media_dir).precompressed_gzip(),
        )
        .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
            axum::http::header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        ));

    let routed = ApiRouter::new()
        .nest_api_service(&base_url, api_v1)
        .finish_api_with(&mut api, api_docs)
        .layer(Extension(Arc::new(api)))
        .merge(media);

    // Applied inside CORS on purpose: a rejected request still needs the CORS
    // headers, or the browser reports a cross-origin failure rather than the
    // 429 the caller should act on.
    let limited = match rate_limiter {
        Some(layer) => routed.layer(layer),
        None => routed,
    };

    let app = limited
        .layer(
            CorsLayer::new()
                .allow_origin(cors_origins)
                .allow_methods(Any)
                .allow_headers([
                    AUTHORIZATION,
                    CONTENT_TYPE,
                    ACCEPT,
                    HeaderName::from_static("x-api-key"),
                ]),
        )
        .layer(
            TraceLayer::new_for_http()
                .on_request(|request: &axum::http::Request<_>, _span: &tracing::Span| {
                    let caller = request
                        .headers()
                        .get("x-forwarded-for")
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string())
                        .unwrap_or_default();
                    tracing::info!(
                        "{} {} from {}",
                        request.method(),
                        request.uri().path(),
                        caller
                    );
                })
                .on_response(
                    |response: &axum::http::Response<_>,
                     _latency: std::time::Duration,
                     _span: &tracing::Span| {
                        tracing::debug!(
                            "Response: {}, {:#?}",
                            response.status(),
                            response.headers()
                        );
                    },
                ),
        )
        .with_state(state);

    let port = dotenvy::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();
    tracing::info!("Listening on port {}", port);
    // Connect info is what lets the rate limiter identify a direct caller when
    // there are no proxy headers to read.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}
