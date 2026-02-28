use std::sync::Arc;

use axum::{
    extract::{Multipart, State},
    Json,
};
use reqwest::header::AUTHORIZATION;
use serde_json::{json, Value};

use crate::{app_state::AppState, error::AppError};

const WHISPER_URL:   &str = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_MODEL: &str = "whisper-1";

/// Map the language string sent by the frontend to an ISO 639-1 code
/// accepted by the Whisper API, or `None` to let Whisper auto-detect.
/// Mirrors normalizeLanguage() in api/src/functions/transcribe.ts.
fn normalize_language(raw: &str) -> Option<&'static str> {
    // Bind to a local variable so the temporary String outlives the match.
    let lower = raw.to_lowercase();
    match lower.trim() {
        "norwegian" | "no" | "nb" | "nb-no" => Some("no"),
        "english"   | "en" | "en-us" | "en-gb" => Some("en"),
        _ => None,
    }
}

pub async fn handler(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<Value>, AppError> {
    let mut audio_bytes:    Option<Vec<u8>> = None;
    let mut filename        = "recording.webm".to_string();
    let mut audio_mime_type = "audio/webm".to_string();
    let mut raw_language:   Option<String>  = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Multipart(e.to_string()))?
    {
        match field.name() {
            Some("file") => {
                filename = field
                    .file_name()
                    .unwrap_or("recording.webm")
                    .to_string();

                // Capture MIME type before consuming the field (axum moves it on .bytes()).
                // The browser sets this from blob.type, so it reflects the actual codec
                // (audio/webm, audio/mp4, etc.) rather than a hardcoded assumption.
                audio_mime_type = field
                    .content_type()
                    .unwrap_or("audio/webm")
                    .to_string();

                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::Multipart(e.to_string()))?;

                audio_bytes = Some(bytes.to_vec());
            }

            Some("language") => {
                raw_language = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::Multipart(e.to_string()))?,
                );
            }

            _ => { /* ignore unexpected fields */ }
        }
    }

    let bytes    = audio_bytes.ok_or(AppError::MissingAudio)?;
    let language = raw_language.as_deref().and_then(normalize_language);

    tracing::debug!(bytes = bytes.len(), mime = %audio_mime_type, ?language, "Sending audio to Whisper");

    // Build the multipart form for the OpenAI Whisper endpoint.
    let file_part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str(&audio_mime_type)
        .map_err(|e| AppError::Whisper(e.to_string()))?;

    let mut form = reqwest::multipart::Form::new()
        .part("file",            file_part)
        .text("model",           WHISPER_MODEL)
        .text("response_format", "json");

    if let Some(lang) = language {
        form = form.text("language", lang);
    }

    // Reuse the shared connection pool — no TLS handshake overhead per request.
    let response = state.http_client
        .post(WHISPER_URL)
        .header(AUTHORIZATION, format!("Bearer {}", state.config.openai_api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| AppError::Whisper(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body   = response.text().await.unwrap_or_default();
        return Err(AppError::Whisper(format!("HTTP {status}: {body}")));
    }

    let text = response
        .json::<Value>()
        .await
        .map_err(|e| AppError::Whisper(e.to_string()))?
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    tracing::info!(chars = text.len(), "Transcription complete");

    Ok(Json(json!({ "text": text })))
}
