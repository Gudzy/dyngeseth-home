/**
 * Simple in-memory IP rate limiter.
 *
 * Limitations: resets on cold start, not shared across function instances.
 * Sufficient for a personal portfolio — instances rarely scale beyond one.
 */

const WINDOW_MS    = 60_000 // 1 minute
const MAX_REQUESTS = 10     // per IP per window

interface Entry {
  count:   number
  resetAt: number
}

const store = new Map<string, Entry>()

// Purge expired entries once per window to prevent unbounded memory growth.
// .unref() lets the Node.js process exit naturally without waiting for this timer.
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
}, WINDOW_MS).unref()

/**
 * Returns true if the given IP has exceeded the rate limit.
 * Call once per request — it increments the counter as a side effect.
 */
export function isRateLimited(ip: string): boolean {
  const now   = Date.now()
  const entry = store.get(ip)

  if (!entry || entry.resetAt <= now) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  entry.count++
  return entry.count > MAX_REQUESTS
}
