use std::sync::Arc;

use aide::{
    axum::{ApiRouter, IntoApiResponse, routing::{get, get_with}},
    openapi::OpenApi,
    transform::TransformOpenApi,
};
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
    layers::auth::{api_token_auth, api_token_auth_optional},
    routes::{
        docs::docs_routes,
        groups::group_routes,
        users::list_users,
        users::list_users_docs,
        waterways::{rivers_read_routes, rivers_write_routes},
        tokens::tokens_routes,
    },
    state::{AppState, KeycloakState},
};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderName};
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

async fn index() -> impl IntoApiResponse {
    "Welcome to the Paddlemate API"
}

fn api_docs(api: TransformOpenApi) -> TransformOpenApi {
    let base_url = dotenvy::var("BASE_URL").unwrap_or_else(|_| "".to_string());

    api.title("Paddlemate API")
        .summary("Paddlemate platform")
        .description("API for managing the Paddlemate platform")
        .server(aide::openapi::Server {
            url: base_url,
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
            eprintln!("Error loading DATABASE_URL: {}", err);
            return;
        }
    };

    let db = match PgPoolOptions::new()
        .max_connections(20)
        .connect(&database_url)
        .await
    {
        Ok(pool) => pool,
        Err(err) => {
            eprintln!("Error connecting to the database: {}", err);
            return;
        }
    };

    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("Failed to run database migrations");

    aide::generate::extract_schemas(true);

    let mut api = OpenApi::default();

    let username_cache: Cache<String, String> = Cache::builder()
        .time_to_live(Duration::from_secs(600))
        .max_capacity(10_000)
        .build();

    let state = AppState {
        pg_pool: db,
        keycloak_config: KeycloakState {
            url: keycloak_url.clone(),
            realm: keycloak_realm.clone(),
            client_id: keycloak_client_id,
            client_secret: keycloak_client_secret,
        },
        admin_token_cache: Arc::new(tokio::sync::RwLock::new(None)),
        username_cache,
    };

    let keycloak_auth_instance = Arc::new(KeycloakAuthInstance::new(
        KeycloakConfig::builder()
            .server(Url::parse(&keycloak_url).expect("Invalid Keycloak URL"))
            .realm(keycloak_realm.clone())
            .retry((5, 2))
            .build(),
    ));

    let protected = ApiRouter::new()
        .nest_api_service("/tokens", tokens_routes(state.clone()))
        .nest_api_service("/groups", group_routes(state.clone()))
        .api_route("/users", get_with(list_users, list_users_docs))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            api_token_auth,
        ));

    let river_app = ApiRouter::new()
        .nest_api_service("/rivers", rivers_read_routes(state.clone()))
        .nest_api_service("/rivers", rivers_write_routes(state.clone()))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            api_token_auth_optional,
        ));

    let app = ApiRouter::new()
        .merge(protected)
        .merge(river_app)
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
        .finish_api_with(&mut api, api_docs)
        .layer(Extension(Arc::new(api)))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
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
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();
    tracing::info!("Listening on port {}", port);
    axum::serve(listener, app).await.unwrap();
}
