use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Missing `file` field in multipart form")]
    MissingAudio,

    #[error("Failed to read multipart form: {0}")]
    Multipart(String),

    #[error("OpenAI Whisper request failed: {0}")]
    Whisper(String),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::MissingAudio | AppError::Multipart(_) => StatusCode::BAD_REQUEST,
            AppError::Whisper(_) | AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        tracing::error!(error = %self);

        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}
