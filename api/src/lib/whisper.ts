import OpenAI, { toFile } from 'openai'

const WHISPER_MODEL = 'whisper-1' as const

export type WhisperLanguage = 'en' | 'no' | null

// Module-level singleton — created once per cold start, reused across warm
// invocations. Avoids rebuilding the HTTPS connection pool on every request.
let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY environment variable is not set. ' +
          'Add it to Azure App Settings (production) or local.settings.json (local dev).',
      )
    }
    _client = new OpenAI({ apiKey })
  }
  return _client
}

/**
 * Transcribes raw audio bytes using OpenAI Whisper.
 * @param buffer   Raw audio data (WebM, MP4, OGG, WAV, etc.)
 * @param filename File name — the extension tells OpenAI the container format.
 * @param language ISO 639-1 code ('en', 'no') or null to auto-detect.
 * @param mimeType Actual MIME type of the audio data (forwarded from the client).
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  language: WhisperLanguage,
  mimeType = 'audio/webm',
): Promise<string> {
  const params: OpenAI.Audio.Transcriptions.TranscriptionCreateParams = {
    model: WHISPER_MODEL,
    file: await toFile(buffer, filename, { type: mimeType }),
    response_format: 'json',
    ...(language ? { language } : {}),
  }

  const result = await getClient().audio.transcriptions.create(params)
  return result.text
}
