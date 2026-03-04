const buckets = new Map<string, { count: number; resetAt: number }>();
let nextPruneAt = 0;

function pruneExpiredBuckets(now: number) {
  if (now < nextPruneAt) return;
  for (const [key, value] of buckets.entries()) {
    if (now >= value.resetAt) {
      buckets.delete(key);
    }
  }
  nextPruneAt = now + 30_000;
}

export function checkRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  pruneExpiredBuckets(now);
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}
