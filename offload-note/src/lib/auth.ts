import "server-only";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, one } from "./db";
import { BASE_PATH } from "./paths";
import { SESSION_DAYS, LOGIN_FAILS_BEFORE_LOCK, LOGIN_LOCK_MINUTES } from "@/config/offload";

export type Role = "operative" | "admin";
export type Operative = { id: string; name: string; role: Role };

const COOKIE = "offload_session";

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPin(pin: string, stored: string): boolean {
  const [alg, s, h] = stored.split("$");
  if (alg !== "scrypt" || !s || !h) return false;
  const expected = Buffer.from(h, "base64");
  const got = scryptSync(pin, Buffer.from(s, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, got);
}

const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
export const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");

/** First run: create the owner's admin login from ADMIN_NAME and ADMIN_PIN. */
export async function ensureBootstrapAdmin(): Promise<void> {
  const r = await one<{ n: string }>(`SELECT count(*)::text AS n FROM operatives`);
  if (Number(r?.n ?? 0) > 0) return;
  let name = process.env.ADMIN_NAME?.trim();
  let pin = process.env.ADMIN_PIN?.trim();
  if ((!name || !pin) && process.env.NODE_ENV !== "production") {
    name = "Admin";
    pin = "123456";
  }
  if (!name || !pin || !isValidPin(pin)) return;
  await query(
    `INSERT INTO operatives (id, name, name_key, pin_hash, role) VALUES ($1,$2,$3,$4,'admin') ON CONFLICT (name_key) DO NOTHING`,
    [randomUUID(), name, nameKey(name), hashPin(pin)],
  );
}

export type LoginResult = { ok: true; operative: Operative } | { ok: false; error: string };

export async function login(name: string, pin: string, userAgent: string): Promise<LoginResult> {
  await ensureBootstrapAdmin();
  const bad: LoginResult = { ok: false, error: "Name or PIN not recognised." };
  const op = await one<any>(`SELECT * FROM operatives WHERE name_key = $1`, [nameKey(name)]);
  if (!op || !op.active) return bad;
  if (op.locked_until && new Date(op.locked_until) > new Date()) {
    return { ok: false, error: `Too many wrong PINs. Try again after ${LOGIN_LOCK_MINUTES} minutes or ask the office to reset it.` };
  }
  if (!verifyPin(pin, op.pin_hash)) {
    const fails = op.failed_pins + 1;
    const lock = fails >= LOGIN_FAILS_BEFORE_LOCK;
    await query(
      `UPDATE operatives SET failed_pins = $2, locked_until = $3 WHERE id = $1`,
      [op.id, lock ? 0 : fails, lock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : null],
    );
    return bad;
  }
  await query(`UPDATE operatives SET failed_pins = 0, locked_until = NULL WHERE id = $1`, [op.id]);
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query(`INSERT INTO sessions (token_hash, operative_id, user_agent, expires_at) VALUES ($1,$2,$3,$4)`, [
    tokenHash(token),
    op.id,
    userAgent,
    expires,
  ]);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: BASE_PATH,
    expires,
  });
  return { ok: true, operative: { id: op.id, name: op.name, role: op.role } };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash(t)]);
  jar.set(COOKIE, "", { path: BASE_PATH, expires: new Date(0) });
}

export async function currentOperative(): Promise<Operative | null> {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (!t) return null;
  const r = await one<any>(
    `SELECT o.id, o.name, o.role FROM sessions s JOIN operatives o ON o.id = s.operative_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND o.active`,
    [tokenHash(t)],
  );
  return r ? { id: r.id, name: r.name, role: r.role } : null;
}

/** For pages: send to login if not signed in. */
export async function requireOperativePage(): Promise<Operative> {
  const op = await currentOperative();
  if (!op) redirect("/login");
  return op;
}

export async function requireAdminPage(): Promise<Operative> {
  const op = await requireOperativePage();
  if (op.role !== "admin") redirect("/");
  return op;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For route handlers and server actions. */
export async function requireOperative(): Promise<Operative> {
  const op = await currentOperative();
  if (!op) throw new HttpError(401, "Signed out. Log in again.");
  return op;
}

export async function requireAdmin(): Promise<Operative> {
  const op = await requireOperative();
  if (op.role !== "admin") throw new HttpError(403, "Admins only.");
  return op;
}
