import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { transcribeAudio, type WhisperLanguage } from '../lib/whisper'
import { validateAudioSize, ValidationError } from '../lib/validate'
import { isRateLimited } from '../lib/rateLimit'

/**
 * Maps the language string sent by the frontend to an ISO 639-1 code
 * accepted by Whisper, or null to let Whisper auto-detect.
 */
function normalizeLanguage(raw: string | null): WhisperLanguage {
  switch (raw?.toLowerCase().trim()) {
    case 'norwegian':
    case 'no':
    case 'nb':
    case 'nb-no':
      return 'no'
    case 'english':
    case 'en':
    case 'en-us':
    case 'en-gb':
      return 'en'
    default:
      return null
  }
}

async function transcribeHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    if (isRateLimited(ip)) {
      return {
        status: 429,
        headers: { 'Retry-After': '60' },
        jsonBody: { error: 'Too many requests. Please wait a minute.' },
      }
    }

    const formData = await request.formData()

    const filePart = formData.get('file')
    if (!filePart || typeof filePart === 'string') {
      return {
        status: 400,
        jsonBody: { error: 'Missing `file` field in multipart form.' },
      }
    }

    const audioBuffer = Buffer.from(await filePart.arrayBuffer())
    validateAudioSize(audioBuffer.byteLength)

    const rawLang = formData.get('language')
    const language = normalizeLanguage(typeof rawLang === 'string' ? rawLang : null)
    const filename = filePart.name || 'recording.webm'

    // Forward the browser's actual MIME type so Whisper receives the correct
    // container label — Safari records audio/mp4, not audio/webm.
    const mimeType = filePart.type || 'audio/webm'

    context.log(`Transcribing: ${audioBuffer.byteLength} bytes, mime=${mimeType}, lang=${language ?? 'auto'}`)

    const text = await transcribeAudio(audioBuffer, filename, language, mimeType)

    context.log(`Done: ${text.length} chars`)
    return { status: 200, jsonBody: { text } }
  } catch (err) {
    if (err instanceof ValidationError) {
      return { status: 400, jsonBody: { error: err.message } }
    }

    // Log full error server-side, never expose internal details to the client
    // (guards against leaking API key status, quota errors, etc.)
    context.error('Transcription error:', err)
    return {
      status: 500,
      jsonBody: { error: 'Transcription failed. Please try again.' },
    }
  }
}

app.http('transcribe', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'transcribe',
  handler: transcribeHandler,
})
