import { NextResponse } from "next/server";
import { requireOperative, HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getNote, assertOwner } from "@/lib/notes";
import { getObject, signedUrl } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const op = await requireOperative();
  const { id } = await ctx.params;
  const row = await getNote(id);
  if (!row) throw new HttpError(404, "Not found.");
  assertOwner(op, row);
  const which = new URL(req.url).searchParams.get("which");
  const key = which === "destination" ? row.destination_pdf_key : row.pdf_key;
  if (!key) throw new HttpError(404, "No PDF for this note yet.");
  const filename = which === "destination" ? `${row.note_no}-destination.pdf` : `${row.note_no}.pdf`;
  await audit("pdf_viewed", { noteId: row.id, operativeId: op.id, detail: { which: which ?? "note" } });
  const url = await signedUrl(key, filename);
  if (url) return NextResponse.redirect(url, 302);
  const body = await getObject(key);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
});
