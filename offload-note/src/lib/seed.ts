import "server-only";
import { query, one } from "./db";
import { VEHICLES } from "@/config/offload";
import { ensureBootstrapAdmin } from "./auth";

let done = false;

/** First run only: vans from config into the database, and the owner's admin login. */
export async function ensureSeeded(): Promise<void> {
  if (done) return;
  await ensureBootstrapAdmin();
  const r = await one<{ n: string }>(`SELECT count(*)::text AS n FROM vehicles`);
  if (Number(r?.n ?? 0) === 0) {
    for (const reg of VEHICLES) await query(`INSERT INTO vehicles (reg) VALUES ($1) ON CONFLICT DO NOTHING`, [reg.toUpperCase()]);
  }
  done = true;
}
