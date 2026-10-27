/**
 * Ventana fija en memoria por clave (IP). Suficiente para un único servidor físico;
 * si se escala a varias instancias, moverlo a la base o a un proxy.
 * @param {{ limit: number, windowMs: number, now?: () => number, maxKeys?: number }} options
 */
export function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = 10_000 }) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit debe ser un entero positivo.");
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError("windowMs debe ser positivo.");

  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();

  function prune(currentTime) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) buckets.delete(key);
    }
  }

  return {
    /** @param {string} key @returns {{ allowed: boolean, retryAfterSeconds: number }} */
    consume(key) {
      const currentTime = now();
      if (buckets.size >= maxKeys) prune(currentTime);

      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= currentTime) {
        bucket = { count: 0, resetAt: currentTime + windowMs };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      return {
        allowed: bucket.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
      };
    },
  };
}
