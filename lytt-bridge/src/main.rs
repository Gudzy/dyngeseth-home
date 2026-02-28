mod app_state;
mod config;
mod error;
mod routes;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use anyhow::Context;
use axum::{extract::DefaultBodyLimit, routing::{get, post}, Router};
use clap::Parser;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use app_state::AppState;
use config::Config;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file if present (ignored silently if missing)
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "lytt_bridge=debug,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::parse();
    config.validate().context("Invalid configuration")?;

    // Build a shared HTTP client with a connection pool and a timeout that
    // exceeds the longest Whisper transcription we'd ever expect (30 s).
    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .context("Failed to build HTTP client")?;

    let addr: SocketAddr = config.addr().parse().context("Invalid bind address")?;
    let state = Arc::new(AppState { config, http_client });

    let app = Router::new()
        .route("/health",     get(routes::health::handler))
        .route("/transcribe", post(routes::transcribe::handler))
        // 26 MB body limit — 1 MB headroom above OpenAI Whisper's 25 MB hard cap.
        .layer(DefaultBodyLimit::max(26 * 1024 * 1024))
        // Allow the frontend (any local origin) to reach this localhost server.
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    tracing::info!("lytt-bridge listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("Failed to bind to address")?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("Server error")?;

    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install Ctrl+C handler");
    tracing::info!("Shutdown signal received — stopping");
}
