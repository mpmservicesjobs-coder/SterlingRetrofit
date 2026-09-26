import "server-only";
import { query, one } from "./db";

/** Records an event and returns true if the key is still under the limit. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const r = await one<{ n: string }>(
    `SELECT count(*)::text AS n FROM rate_events WHERE key = $1 AND at > now() - make_interval(secs => $2)`,
    [key, windowSeconds],
  );
  if (Number(r?.n ?? 0) >= limit) return false;
  await query(`INSERT INTO rate_events (key) VALUES ($1)`, [key]);
  // Keep the table small.
  if (Math.random() < 0.02) await query(`DELETE FROM rate_events WHERE at < now() - interval '2 days'`);
  return true;
}
