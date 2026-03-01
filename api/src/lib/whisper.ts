import https from 'https'

const WHISPER_HOSTNAME = 'api.openai.com'
const WHISPER_PATH     = '/v1/audio/transcriptions'
const WHISPER_MODEL    = 'whisper-1'

export type WhisperLanguage = 'en' | 'no' | null

/**
 * Build a multipart/form-data body from parts.
 * Returns both the Buffer and the boundary string for the Content-Type header.
 */
function buildMultipartBody(
  audioBuffer: Buffer,
  filename: string,
  language: WhisperLanguage,
  mimeType: string,
): { body: Buffer; boundary: string } {
  const boundary = `FormBoundary${Date.now().toString(16)}`
  const parts: Buffer[] = []

  function addTextField(name: string, value: string) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ))
  }

  addTextField('model', WHISPER_MODEL)
  addTextField('response_format', 'json')
  if (language) addTextField('language', language)

  // Binary file field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ))
  parts.push(audioBuffer)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  return { body: Buffer.concat(parts), boundary }
}

/**
 * Transcribes raw audio bytes using OpenAI Whisper via https.request().
 *
 * We use the built-in https module directly (not the openai SDK) because the
 * SDK's fetch-based multipart body serialisation fails silently in the Azure
 * SWA managed function sandbox, while https.request() works reliably.
 *
 * @param buffer   Raw audio data (WebM, MP4, OGG, WAV, etc.)
 * @param filename Filename whose extension tells Whisper the container format.
 * @param language ISO 639-1 code ('en', 'no') or null to auto-detect.
 * @param mimeType Actual MIME type of the audio (forwarded from the client).
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  language: WhisperLanguage,
  mimeType = 'audio/webm',
): Promise<string> {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. ' +
      'Add it to Azure App Settings (production) or local.settings.json (local dev).',
    )
  }

  const { body, boundary } = buildMultipartBody(buffer, filename, language, mimeType)

  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: WHISPER_HOSTNAME,
        path: WHISPER_PATH,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode === 200) {
            try {
              resolve((JSON.parse(raw) as { text: string }).text)
            } catch {
              reject(new Error(`Whisper response parse error: ${raw.slice(0, 200)}`))
            }
          } else {
            reject(new Error(`Whisper API ${res.statusCode}: ${raw.slice(0, 300)}`))
          }
        })
      },
    )

    req.on('error', reject)
    // 120-second hard limit — Whisper typically responds in < 10s for short clips
    req.setTimeout(120_000, () => {
      req.destroy()
      reject(new Error('Whisper request timed out after 120 s'))
    })

    req.write(body)
    req.end()
  })
}
