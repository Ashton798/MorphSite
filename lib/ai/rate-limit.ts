// Lightweight in-memory guard: enough to stop a single tab (or a leaked URL)
// from hammering a paid provider. A multi-instance deployment should use Redis.
type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();
const LIMIT = 12;
const WINDOW_MS = 60_000;

export function rateLimit(key: string, limit = LIMIT): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: limit, updated: now };
  const refill = ((now - bucket.updated) / WINDOW_MS) * limit;
  bucket.tokens = Math.min(limit, bucket.tokens + refill);
  bucket.updated = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return { ok: false, retryAfter: Math.ceil(((1 - bucket.tokens) / limit) * (WINDOW_MS / 1000)) };
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  if (buckets.size > 5000) buckets.clear();
  return { ok: true, retryAfter: 0 };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
