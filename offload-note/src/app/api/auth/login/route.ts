import { NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { handle } from "@/lib/api";
import { audit, requestInfo } from "@/lib/audit";
import { rateLimit } from "@/lib/rate";

export const POST = handle(async (req: Request) => {
  const { ip, userAgent } = await requestInfo();
  if (!(await rateLimit(`login:${ip}`, 20, 900)))
    return NextResponse.json({ error: "Too many tries. Wait 15 minutes." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").slice(0, 80);
  const pin = String(body.pin ?? "").slice(0, 12);
  const r = await login(name, pin, userAgent);
  await audit(r.ok ? "login" : "login_failed", { operativeId: r.ok ? r.operative.id : null, detail: { name } });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 });
  return NextResponse.json({ operative: r.operative });
});
