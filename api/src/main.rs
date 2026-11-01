use std::sync::Arc;

use aide::{
    axum::{ApiRouter, IntoApiResponse, routing::get},
    openapi::OpenApi,
    transform::TransformOpenApi,
};
use axum::http::HeaderValue;
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
    config::Config,
    layers::auth::{api_token_auth, api_token_auth_optional},
    layers::limit::{RateLimits, limit_requests, limit_writes},
    routes::{
        descents::descents_routes, docs::docs_routes, gauges::gauges_routes, geo::geo_routes,
        groups::group_routes, materials::materials_routes, proposals::proposals_routes,
        trips::trips_routes, users::users_routes, waterways::waterways_routes,
    },
    state::{AppState, KeycloakState},
};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, ETAG, HeaderName, IF_MATCH};
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    trace::TraceLayer,
};

async fn index() -> impl IntoApiResponse {
    "Welcome to the Paddlemate API"
}

fn api_docs(api: TransformOpenApi, token_url: String) -> TransformOpenApi {
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
                        token_url,
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

    let config = match Config::from_env() {
        Ok(config) => config,
        Err(err) => {
            eprintln!("Error loading configuration: {err}");
            std::process::exit(1);
        }
    };
    let keycloak = config.keycloak.clone();

    tracing::info!("Keycloak URL: {}", keycloak.url);
    tracing::info!("Keycloak realm: {}", keycloak.realm);
    tracing::info!("Keycloak audience: {}", keycloak.audience);

    // How close a name has to be for search to treat a misspelling as a match.
    // Only the pg_trgm operators consult this setting, and only they can use
    // the trigram indexes, so it has to be set per connection rather than
    // written into the query.
    let word_similarity_threshold = config.search_word_similarity_threshold;
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
        .connect(&config.database_url)
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
    if config.run_migrations {
        sqlx::migrate!("./migrations")
            .run(&db)
            .await
            .expect("Failed to run database migrations");
    } else {
        tracing::info!("Skipping migrations (RUN_MIGRATIONS=false)");
    }

    // Comma separated list of origins allowed to call the API from a browser.
    // Unset means any origin: the API is public. A list narrows it for a
    // deployment that wants that.
    let cors_origins = match &config.cors_origins {
        Some(list) => {
            tracing::info!("CORS allowed origins: {}", list.join(","));
            AllowOrigin::list(
                list.iter()
                    .filter_map(|origin| origin.parse::<HeaderValue>().ok()),
            )
        }
        None => {
            tracing::warn!("CORS_ALLOWED_ORIGINS is unset, allowing any origin");
            AllowOrigin::any()
        }
    };

    let metrics = paddlemate_api::metrics::install();

    aide::generate::extract_schemas(true);

    let mut api = OpenApi::default();

    let username_cache: Cache<String, String> = Cache::builder()
        .time_to_live(Duration::from_secs(600))
        .max_capacity(10_000)
        .build();

    let state = AppState {
        pg_pool: db.clone(),
        keycloak_config: KeycloakState {
            url: keycloak.url.clone(),
            realm: keycloak.realm.clone(),
            client_id: keycloak.client_id.clone(),
            client_secret: keycloak.client_secret.clone(),
        },
        admin_token_cache: Arc::new(tokio::sync::RwLock::new(None)),
        username_cache,
        gauge_wake: Arc::new(tokio::sync::Notify::new()),
        region_wake: Arc::new(tokio::sync::Notify::new()),
        live_events: tokio::sync::broadcast::channel(paddlemate_api::notify::LIVE_BUFFER).0,
        push: paddlemate_api::notify::push_from_config(&config),
        live_streams: Default::default(),
    };

    let keycloak_auth_instance = Arc::new(KeycloakAuthInstance::new(
        KeycloakConfig::builder()
            .server(Url::parse(&keycloak.url).expect("Invalid Keycloak URL"))
            .realm(keycloak.realm.clone())
            .retry((5, 2))
            .build(),
    ));

    let base_url = config.base_url.clone();
    let limits = RateLimits::from_config(&config);

    let protected = ApiRouter::new()
        .nest_api_service("/users", users_routes(state.clone()))
        .nest_api_service("/groups", group_routes(state.clone()))
        // Inside sign-in, so a write is charged to the user.
        .layer(middleware::from_fn_with_state(limits.clone(), limit_writes))
        .layer(middleware::from_fn(paddlemate_api::metrics::tag_client))
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
        .nest_api_service("/materials", materials_routes(state.clone()))
        .nest_api_service("/geo", geo_routes(state.clone()))
        .nest_api_service("/proposals", proposals_routes(state.clone()))
        .nest_api_service("/trips", trips_routes(state.clone()))
        .layer(middleware::from_fn_with_state(limits.clone(), limit_writes))
        .layer(middleware::from_fn(paddlemate_api::metrics::tag_client))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            api_token_auth_optional,
        ));

    paddlemate_api::jobs::spawn_all(&state, &config, &limits);

    let api_v1 = ApiRouter::new()
        .merge(protected)
        .merge(waterway_app)
        .layer(
            KeycloakAuthLayer::<String, ProfileAndEmail>::builder()
                .instance(keycloak_auth_instance.clone())
                .passthrough_mode(axum_keycloak_auth::PassthroughMode::Pass)
                .required_roles(vec![])
                .expected_audiences(vec![keycloak.audience.clone()])
                .persist_raw_claims(false)
                .build(),
        )
        .layer(Extension(keycloak_auth_instance.clone()))
        .api_route("/", get(index))
        .nest_api_service("/docs", docs_routes(state.clone()))
        .with_state(state.clone());

    // Uploaded photos, served straight off disk. Keys are random and a
    // stored file never changes, so they can be cached hard.
    let media_dir = config.media_dir.clone();
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
        .finish_api_with(&mut api, |api| api_docs(api, keycloak.token_url.clone()))
        .layer(Extension(Arc::new(api)))
        .layer(middleware::from_fn(
            paddlemate_api::layers::rejection::envelope_rejections,
        ))
        .merge(media);

    // Applied inside CORS on purpose: a rejected request still needs the CORS
    // headers, or the browser reports a cross-origin failure rather than the
    // 429 the caller should act on.
    let limited = routed.layer(middleware::from_fn_with_state(limits, limit_requests));

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
                    // Versioned edits: without it a browser's preflight for a
                    // PATCH carrying If-Match fails before the API sees it.
                    IF_MATCH,
                ])
                // So a browser client can read an item's version back.
                .expose_headers([ETAG]),
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

    // After every layer above, so scrapes are not counted or limited. It sits
    // at the host root, outside the base path a reverse proxy forwards.
    let app = paddlemate_api::metrics::wrap(app, metrics, Some(db.clone()));

    let port = config.port.clone();
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();
    tracing::info!("Listening on port {}", port);
    // Connect info gives the rate limiter the peer address.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}
