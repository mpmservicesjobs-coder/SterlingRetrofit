import { NextResponse } from "next/server";
import { requireOperative, HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { addPhoto } from "@/lib/notes";

export const POST = handle(async (req: Request) => {
  const op = await requireOperative();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new HttpError(400, "No photo.");
  await addPhoto(op, String(form.get("clientId")), Number(form.get("idx")), Buffer.from(await file.arrayBuffer()), file.type);
  return NextResponse.json({ ok: true });
});
