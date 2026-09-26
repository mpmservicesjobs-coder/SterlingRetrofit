import { NextResponse } from "next/server";
import { requireOperative } from "@/lib/auth";
import { handle } from "@/lib/api";
import { reserveNote } from "@/lib/notes";

export const POST = handle(async (req: Request) => {
  const op = await requireOperative();
  const { clientId } = await req.json();
  return NextResponse.json(await reserveNote(op, String(clientId)));
});
