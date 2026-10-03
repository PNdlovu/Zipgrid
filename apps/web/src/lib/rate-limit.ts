/**
 * @file rate-limit.ts
 * @description Fixed-window rate limiting.
 *
 * Uses Upstash Redis (REST) when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * (or the legacy UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN) are set, so limits hold
 * across replicas. Otherwise falls back to an in-process map — correct for a
 * single instance, and logged once so it is never mistaken for a shared limit.
 *
 * @module lib/rate-limit
 */

type Result = { allowed: boolean; remaining: number; retryAfterSeconds: number }

const memory = new Map<string, { count: number; resetAt: number }>()
let warned = false

function upstash(): { url: string; token: string } | null {
  const url = process.env['UPSTASH_REDIS_REST_URL'] ?? process.env['UPSTASH_REDIS_URL']
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'] ?? process.env['UPSTASH_REDIS_TOKEN']
  return url?.startsWith('https://') && token ? { url, token } : null
}

/**
 * Counts a hit for `key` and reports whether it is within `limit` per `windowSeconds`.
 * Fails open (allows) if Redis is unreachable, logging the error.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<Result> {
  const redis = upstash()
  if (redis) {
    const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`
    try {
      const res = await fetch(`${redis.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redis.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['INCR', bucket], ['EXPIRE', bucket, String(windowSeconds)]]),
        signal: AbortSignal.timeout(2_000),
      })
      const [incr] = (await res.json()) as [{ result: number }]
      const count = incr.result
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds),
      }
    } catch (err) {
      console.error('[rate-limit] Upstash unavailable — allowing request', err)
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 }
    }
  }

  if (!warned && process.env.NODE_ENV === 'production') {
    warned = true
    console.warn('[rate-limit] Upstash not configured — using per-instance memory limits')
  }
  const now = Date.now()
  const entry = memory.get(key)
  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    if (memory.size > 50_000) {
      for (const [k, v] of memory) if (now > v.resetAt) memory.delete(k)
    }
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }
  entry.count++
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  }
}

/**
 * Client IP. Railway's edge appends the connecting address to X-Forwarded-For,
 * so the right-most entry (minus TRUSTED_PROXY_HOPS extra proxies, e.g. a CDN)
 * is the only one a client cannot forge.
 */
export function clientIp(headers: Headers): string {
  const hops = Number(process.env['TRUSTED_PROXY_HOPS'] ?? 0)
  const chain = (headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return chain[chain.length - 1 - hops] ?? headers.get('x-real-ip') ?? 'unknown'
}
