use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(
    name    = "lytt-bridge",
    about   = "Local Whisper transcription bridge for dyngeseth.no",
    version
)]
pub struct Config {
    /// OpenAI API key used for Whisper transcription.
    /// Can also be set via the OPENAI_API_KEY environment variable.
    #[arg(long, env = "OPENAI_API_KEY", hide_env_values = true)]
    pub openai_api_key: String,

    /// Host address to listen on.
    #[arg(long, env = "LYTT_HOST", default_value = "127.0.0.1")]
    pub host: String,

    /// Port to listen on.
    #[arg(long, env = "LYTT_PORT", default_value_t = 3000)]
    pub port: u16,
}

impl Config {
    pub fn validate(&self) -> anyhow::Result<()> {
        if self.openai_api_key.trim().is_empty() {
            anyhow::bail!(
                "OPENAI_API_KEY is required. \
                 Set it in your shell or in lytt-bridge/.env"
            );
        }
        Ok(())
    }

    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}
