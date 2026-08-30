import "server-only";

/**
 * Schlankes In-Process-Rate-Limiting (Token Bucket) für Login, Checkout und
 * Webhook-nahe Endpunkte. Bei mehreren Instanzen gehört das hinter den
 * Reverse Proxy bzw. in Redis – das Interface bleibt gleich.
 */
type Bucket = { tokens: number; last: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, perMinute: number): boolean {
  const capacity = perMinute;
  const refillPerMs = perMinute / 60_000;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, last: now };

  bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.last) * refillPerMs);
  bucket.last = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

/** Client-IP aus den üblichen Proxy-Headern. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
