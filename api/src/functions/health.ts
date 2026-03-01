import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

async function healthHandler(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  // Returning 503 when the key is absent lets the frontend fall back
  // to the browser Speech API rather than showing "Cloud · Whisper"
  // and then failing on the first recording attempt.
  if (!process.env['OPENAI_API_KEY']) {
    return { status: 503, jsonBody: { ok: false, error: 'Service not configured.' } }
  }
  return { status: 200, jsonBody: { ok: true, node: process.version } }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
})
