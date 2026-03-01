import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import https from 'https'

/** Make a raw HTTPS GET and return the HTTP status code (or an error string). */
async function httpsGet(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{ status?: number; error?: string; ms: number }> {
  const start = Date.now()
  return new Promise((resolve) => {
    const parsed = new URL(url)
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'GET',
      headers,
      timeout: timeoutMs,
    }, (res) => {
      res.resume() // drain so socket can be reused
      resolve({ status: res.statusCode, ms: Date.now() - start })
    })
    req.on('timeout', () => { req.destroy(); resolve({ error: `timeout after ${timeoutMs}ms`, ms: Date.now() - start }) })
    req.on('error', (e) => resolve({ error: e.message, ms: Date.now() - start }))
    req.end()
  })
}

async function healthHandler(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) {
    return { status: 503, jsonBody: { ok: false, error: 'Service not configured.' } }
  }

  // Diagnostic: hit the OpenAI models list endpoint — quick, read-only, requires a valid key+billing.
  // 200 → key + billing ok.  401 → bad key.  429 → no credits / rate limited.
  const openai = await httpsGet(
    'https://api.openai.com/v1/models',
    { Authorization: `Bearer ${apiKey}` },
    8000,
  )

  const ok = openai.status === 200
  return {
    status: ok ? 200 : 503,
    jsonBody: { ok, node: process.version, openai },
  }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
})
