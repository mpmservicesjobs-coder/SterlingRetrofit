import { NextResponse } from "next/server";
import { requireOperative, HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getNote, assertOwner } from "@/lib/notes";

// The structured data of a signed note, used to start a correction.
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const op = await requireOperative();
  const { id } = await ctx.params;
  const row = await getNote(id);
  if (!row || row.state !== "signed" || !row.data) throw new HttpError(404, "Not found.");
  assertOwner(op, row);
  if (row.superseded_by_id) throw new HttpError(409, "This note has already been corrected.");
  const { _signed, ...data } = row.data as any;
  return NextResponse.json({ id: row.id, noteNo: row.note_no, data });
});
