/**
 * Скользящее окно: не больше `limit` событий за `windowMs` на ключ (например, IP).
 * Без таймеров и Node API — время передаётся снаружи.
 */
export const createLimiter = (limit: number, windowMs: number, maxKeys = 10_000) => {
  const hits = new Map<string, number[]>();
  return {
    /** true — можно; событие засчитывается только если разрешено. */
    take(key: string, now: number): boolean {
      const fresh = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (fresh.length >= limit) {
        hits.set(key, fresh);
        return false;
      }
      fresh.push(now);
      hits.delete(key); // свежие ключи — в конец, чтобы вытеснять самые старые
      hits.set(key, fresh);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
      return true;
    },
    /** Через сколько мс освободится место (0 — уже свободно). */
    retryAfter(key: string, now: number): number {
      const fresh = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      return fresh.length < limit ? 0 : windowMs - (now - fresh[0]);
    },
  };
};
