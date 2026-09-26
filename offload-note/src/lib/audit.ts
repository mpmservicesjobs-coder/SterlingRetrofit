import "server-only";
import { headers } from "next/headers";
import { query } from "./db";

export async function requestInfo(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return { ip, userAgent: h.get("user-agent") ?? "" };
}

export async function audit(
  action: string,
  opts: { noteId?: string | null; operativeId?: string | null; detail?: unknown } = {},
): Promise<void> {
  const { ip, userAgent } = await requestInfo();
  await query(
    `INSERT INTO audit_log (note_id, operative_id, action, detail, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)`,
    [opts.noteId ?? null, opts.operativeId ?? null, action, opts.detail ? JSON.stringify(opts.detail) : null, ip, userAgent],
  );
}
