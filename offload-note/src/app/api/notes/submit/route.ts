import { NextResponse } from "next/server";
import { requireOperative, HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { submitNote, SubmitIn } from "@/lib/notes";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const op = await requireOperative();
  const body = (await req.json().catch(() => null)) as SubmitIn | null;
  if (!body || !body.data || !body.customerSig || !body.operativeSig) throw new HttpError(400, "Incomplete note.");
  const r = await submitNote(op, {
    data: body.data,
    customerSig: body.customerSig,
    operativeSig: body.operativeSig,
    send: !!body.send,
    photoCount: Number(body.photoCount) || 0,
  });
  return NextResponse.json(r);
});
