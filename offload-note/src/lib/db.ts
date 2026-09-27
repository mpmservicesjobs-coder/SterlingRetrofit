import "server-only";
import { Pool } from "pg";
import { SCHEMA_SQL } from "./schema";

// Postgres in production (Neon or Supabase, UK or EU region) via DATABASE_URL.
// Without DATABASE_URL in development, an embedded Postgres (PGlite) stores
// data under .data/ so the app runs locally with no setup.

type Row = Record<string, any>;
type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> };

declare global {
  // eslint-disable-next-line no-var
  var __offloadDb: Promise<Q> | undefined;
}

async function connect(): Promise<Q> {
  const url = process.env.DATABASE_URL;
  let q: Q;
  if (url) {
    const pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    q = { query: (sql, params) => pool.query(sql, params as any[]) };
  } else {
    if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_DB) {
      throw new Error("DATABASE_URL is not set.");
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    const dir = process.env.LOCAL_DB_DIR || ".data/pglite";
    mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir);
    q = { query: (sql, params) => pg.query(sql, params as any[]) as Promise<{ rows: Row[] }> };
  }
  for (const stmt of SCHEMA_SQL) await q.query(stmt);
  return q;
}

function db(): Promise<Q> {
  if (!globalThis.__offloadDb) {
    globalThis.__offloadDb = connect().catch((e) => {
      globalThis.__offloadDb = undefined;
      throw e;
    });
  }
  return globalThis.__offloadDb;
}

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await db();
  const r = await c.query(sql, params);
  return r.rows as T[];
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
