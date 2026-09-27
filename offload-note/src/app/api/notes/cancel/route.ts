import { NextResponse } from "next/server";
import { requireOperative } from "@/lib/auth";
import { handle } from "@/lib/api";
import { cancelNote } from "@/lib/notes";

export const POST = handle(async (req: Request) => {
  const op = await requireOperative();
  const { clientId, reason } = await req.json();
  await cancelNote(op, String(clientId), String(reason ?? "").slice(0, 200));
  return NextResponse.json({ ok: true });
});
