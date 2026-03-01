import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import net from 'net'
import dns from 'dns/promises'

async function tcpTest(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; ms?: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = net.createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ ok: false, error: `timeout after ${timeoutMs}ms` })
    }, timeoutMs)
    socket.on('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve({ ok: true, ms: Date.now() - start })
    })
    socket.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, error: e.message })
    })
  })
}

async function healthHandler(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  if (!process.env['OPENAI_API_KEY']) {
    return { status: 503, jsonBody: { ok: false, error: 'Service not configured.' } }
  }

  // Diagnostic: test raw TCP + DNS connectivity to api.openai.com
  const [tcp, dnsResult] = await Promise.allSettled([
    tcpTest('api.openai.com', 443, 8000),
    dns.lookup('api.openai.com'),
  ])

  const tcpResult = tcp.status === 'fulfilled' ? tcp.value : { ok: false, error: String(tcp.reason) }
  const dnsAddr  = dnsResult.status === 'fulfilled' ? dnsResult.value.address : `error: ${dnsResult.reason}`

  const ok = tcpResult.ok
  return {
    status: ok ? 200 : 503,
    jsonBody: { ok, node: process.version, tcp: tcpResult, dns: dnsAddr },
  }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
})
