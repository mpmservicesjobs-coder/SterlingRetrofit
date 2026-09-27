import { NextResponse } from "next/server";
import { logout, currentOperative } from "@/lib/auth";
import { handle } from "@/lib/api";
import { audit } from "@/lib/audit";

export const POST = handle(async () => {
  const op = await currentOperative();
  await logout();
  if (op) await audit("logout", { operativeId: op.id });
  return NextResponse.json({ ok: true });
});
