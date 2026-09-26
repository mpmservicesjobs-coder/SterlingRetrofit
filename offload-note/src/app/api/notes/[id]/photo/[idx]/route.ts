import { NextResponse } from "next/server";
import { requireOperative, HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getNote, assertOwner, listPhotos } from "@/lib/notes";
import { getObject, signedUrl } from "@/lib/storage";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; idx: string }> }) => {
  const op = await requireOperative();
  const { id, idx } = await ctx.params;
  const row = await getNote(id);
  if (!row) throw new HttpError(404, "Not found.");
  assertOwner(op, row);
  const p = (await listPhotos(row.id)).find((x) => x.idx === Number(idx));
  if (!p) throw new HttpError(404, "Not found.");
  const url = await signedUrl(p.storage_key);
  if (url) return NextResponse.redirect(url, 302);
  return new Response(new Uint8Array(await getObject(p.storage_key)), {
    headers: { "Content-Type": p.content_type, "Cache-Control": "private, no-store" },
  });
});
