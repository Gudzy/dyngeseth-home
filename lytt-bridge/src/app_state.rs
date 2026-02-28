use reqwest::Client;

use crate::config::Config;

/// Shared application state injected into every request handler via Axum's
/// `State` extractor. Fields are cheap to clone because both `Config` and
/// `Client` are internally reference-counted.
pub struct AppState {
    pub config: Config,
    /// A single `reqwest::Client` that owns a connection pool. Creating one
    /// per request would open a new TLS handshake for every audio upload;
    /// sharing it reuses existing connections to api.openai.com.
    pub http_client: Client,
}
