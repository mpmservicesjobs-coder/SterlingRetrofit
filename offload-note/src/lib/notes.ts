import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { query, one } from "./db";
import { HttpError, Operative } from "./auth";
import { audit } from "./audit";
import { rateLimit } from "./rate";
import { putObject, getObject } from "./storage";
import { renderNotePdf, renderDestinationPdf, Destination } from "./pdf";
import { sendNoteEmail, Attachment } from "./email";
import { ukDayKey } from "./time";
import { NoteData, validateForSubmit, isValidEmail, normalisePostcode } from "./note";
import { isHazardousCode } from "./ewc";
import { CARRIER_REG_NO, carrierRegMissing, MAX_PHOTOS, RETENTION_YEARS, SENDS_PER_OPERATIVE_PER_HOUR } from "@/config/offload";

export type NoteRow = {
  id: string;
  client_id: string;
  note_no: string;
  state: "draft" | "signed" | "cancelled";
  operative_id: string;
  operative_name?: string;
  created_at: string;
  signed_at: string | null;
  transfer_at: string | null;
  customer_name: string | null;
  company_name: string | null;
  postcode: string | null;
  customer_email: string | null;
  data: NoteData | null;
  data_hash: string | null;
  pdf_key: string | null;
  pdf_sha256: string | null;
  email_requested: boolean;
  email_status: "none" | "pending" | "sent" | "failed";
  email_attempts: number;
  email_last_error: string | null;
  emailed_at: string | null;
  destination: (NonNullable<Destination> & { site_id: number }) | null;
  destination_added_at: string | null;
  destination_pdf_key: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  photo_count: number;
};

// ---------- hashing ----------

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

export const sha256 = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

/** The signed record. Its hash is printed on the PDF so any later edit is detectable. */
export function signedRecord(row: Pick<NoteRow, "note_no" | "data" | "operative_id">, extra: Record<string, unknown>) {
  return { noteNo: row.note_no, operativeId: row.operative_id, data: row.data, ...extra };
}

/** Recomputes the hash from the stored data. False means the record was changed after signing. */
export function verifyHash(row: NoteRow): boolean {
  if (!row.data || !row.data_hash) return false;
  const { _signed, ...data } = row.data as NoteData & { _signed: Record<string, unknown> };
  if (!_signed) return false;
  const record = signedRecord({ note_no: row.note_no, data: data as NoteData, operative_id: row.operative_id }, _signed);
  return sha256(canonicalJson(record)) === row.data_hash;
}

// ---------- status ----------

export type Badge = "draft" | "cancelled" | "superseded" | "complete" | "emailed" | "not emailed" | "not delivered" | "destination missing" | "eligible for deletion";

export function badges(r: NoteRow): Badge[] {
  if (r.state === "draft") return ["draft"];
  if (r.state === "cancelled") return ["cancelled"];
  const b: Badge[] = [];
  if (r.superseded_by_id) b.push("superseded");
  if (r.email_status === "sent") b.push("emailed");
  else if (r.email_requested) b.push("not delivered");
  else b.push("not emailed");
  if (r.destination) b.push("complete");
  else b.push("destination missing");
  if (eligibleForDeletion(r)) b.push("eligible for deletion");
  return b;
}

export function eligibleForDeletion(r: Pick<NoteRow, "signed_at" | "created_at">): boolean {
  const base = new Date(r.signed_at ?? r.created_at);
  const cut = new Date(base);
  cut.setFullYear(cut.getFullYear() + RETENTION_YEARS);
  return new Date() >= cut;
}

// ---------- reserve ----------

async function nextNoteNo(): Promise<string> {
  const day = ukDayKey();
  const r = await one<{ last: number }>(
    `INSERT INTO note_counters (day, last) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET last = note_counters.last + 1 RETURNING last`,
    [day],
  );
  return `OFF-${day}-${String(r!.last).padStart(2, "0")}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getByClientId(clientId: string): Promise<NoteRow | null> {
  if (!UUID_RE.test(clientId)) throw new HttpError(400, "Bad note id.");
  return one<NoteRow>(`SELECT * FROM notes WHERE client_id = $1`, [clientId]);
}

export async function getNote(id: string): Promise<NoteRow | null> {
  if (!UUID_RE.test(id)) return null;
  return one<NoteRow>(
    `SELECT n.*, o.name AS operative_name FROM notes n JOIN operatives o ON o.id = n.operative_id WHERE n.id = $1`,
    [id],
  );
}

function assertOwner(op: Operative, row: NoteRow) {
  if (op.role !== "admin" && row.operative_id !== op.id) throw new HttpError(403, "This note belongs to someone else.");
}

/** Gives a new note its number. Safe to call again with the same clientId. */
export async function reserveNote(op: Operative, clientId: string): Promise<{ id: string; noteNo: string }> {
  const existing = await getByClientId(clientId);
  if (existing) {
    assertOwner(op, existing);
    return { id: existing.id, noteNo: existing.note_no };
  }
  const noteNo = await nextNoteNo();
  const id = randomUUID();
  const r = await one<{ id: string; note_no: string }>(
    `INSERT INTO notes (id, client_id, note_no, operative_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (client_id) DO NOTHING RETURNING id, note_no`,
    [id, clientId, noteNo, op.id],
  );
  if (!r) {
    const again = (await getByClientId(clientId))!;
    return { id: again.id, noteNo: again.note_no };
  }
  await audit("reserved", { noteId: r.id, operativeId: op.id, detail: { noteNo } });
  return { id: r.id, noteNo: r.note_no };
}

export async function cancelNote(op: Operative, clientId: string, reason: string): Promise<void> {
  const row = await getByClientId(clientId);
  if (!row) return;
  assertOwner(op, row);
  if (row.state !== "draft") throw new HttpError(409, "A signed note cannot be cancelled. Create a correction instead.");
  await query(`UPDATE notes SET state = 'cancelled' WHERE id = $1`, [row.id]);
  await audit("cancelled", { noteId: row.id, operativeId: op.id, detail: { reason } });
}

// ---------- submit ----------

export type SignatureIn = { dataUrl: string; at: string; userAgent: string };
export type SubmitIn = {
  data: NoteData;
  customerSig: SignatureIn;
  operativeSig: SignatureIn;
  send: boolean;
  photoCount: number;
};

export type SubmitOut = {
  id: string;
  noteNo: string;
  emailStatus: NoteRow["email_status"];
  emailRequested: boolean;
  email: string | null;
  error?: string;
};

function decodePng(dataUrl: string): Buffer {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new HttpError(400, "Signature missing.");
  const b = Buffer.from(m[1], "base64");
  if (b.length < 100 || b.length > 600_000 || b.readUInt32BE(0) !== 0x89504e47) throw new HttpError(400, "Signature image is not valid.");
  return b;
}

async function destinationFor(siteId: number | null): Promise<NoteRow["destination"]> {
  if (!siteId) return null;
  const s = await one<any>(`SELECT * FROM sites WHERE id = $1`, [siteId]);
  if (!s) throw new HttpError(400, "That destination site no longer exists.");
  return {
    site_id: s.id,
    name: s.name,
    address: s.address,
    permit_no: s.permit_no,
    last_checked: s.last_checked ? new Date(s.last_checked).toISOString().slice(0, 10) : null,
  };
}

async function vehicleText(d: NoteData): Promise<string> {
  return d.vehicle === "other" ? d.vehicleOther.trim().toUpperCase() : d.vehicle;
}

function cleanData(d: NoteData): NoteData {
  return {
    ...d,
    postcode: normalisePostcode(d.postcode),
    email: d.noEmail ? "" : d.email.trim(),
    emailConfirm: "",
    customerName: d.customerName.trim(),
    companyName: d.companyName.trim(),
    lines: d.lines.map((l) => ({ ...l, ewc: l.ewc.replace(/\s/g, "") })),
  };
}

export async function submitNote(op: Operative, input: SubmitIn): Promise<SubmitOut> {
  if (carrierRegMissing()) throw new HttpError(503, "The carrier registration number is not set. Notes cannot be sent until the office adds it.");
  const data = cleanData(input.data);
  const errors = validateForSubmit(input.data, input.send);
  if (Object.keys(errors).length) throw new HttpError(422, `Not finished: ${Object.values(errors)[0]}`);
  if (data.hazardous !== "no" || data.lines.some((l) => isHazardousCode(l.ewc)))
    throw new HttpError(422, "Hazardous waste cannot go on a transfer note.");
  if (input.send && !isValidEmail(data.email)) throw new HttpError(422, "A valid email is needed to send the note.");

  // Already signed? Return what happened last time. Never make a second PDF.
  let row = await getByClientId(data.clientId);
  if (row && row.state === "signed") {
    assertOwner(op, row);
    return { id: row.id, noteNo: row.note_no, emailStatus: row.email_status, emailRequested: row.email_requested, email: row.customer_email };
  }
  if (row && row.state === "cancelled") throw new HttpError(409, "This note was cancelled.");

  if (!(await rateLimit(`send:${op.id}`, SENDS_PER_OPERATIVE_PER_HOUR, 3600)))
    throw new HttpError(429, "Too many notes sent in the last hour. Call the office.");

  let supersedes: NoteRow | null = null;
  if (data.supersedesId) {
    supersedes = await getNote(data.supersedesId);
    if (!supersedes || supersedes.state !== "signed") throw new HttpError(400, "The note being corrected was not found.");
    if (supersedes.superseded_by_id) throw new HttpError(409, `Note ${supersedes.note_no} has already been corrected.`);
    assertOwner(op, supersedes);
    data.supersedesNo = supersedes.note_no;
  }

  if (!row) {
    await reserveNote(op, data.clientId);
    row = (await getByClientId(data.clientId))!;
  }
  assertOwner(op, row);
  data.noteNo = row.note_no;

  const custPng = decodePng(input.customerSig.dataUrl);
  const opPng = decodePng(input.operativeSig.dataUrl);
  const dest = await destinationFor(data.destinationSiteId);
  const vehicle = await vehicleText(data);
  const signedAt = new Date().toISOString();
  const customerSig = { name: data.customerSignName.trim(), at: input.customerSig.at, userAgent: input.customerSig.userAgent.slice(0, 400), sha256: sha256(custPng) };
  const operativeSig = { name: data.operativeSignName.trim(), at: input.operativeSig.at, userAgent: input.operativeSig.userAgent.slice(0, 400), sha256: sha256(opPng) };

  const base = `notes/${row.note_no}`;
  await putObject(`${base}/signature-transferor.png`, custPng, "image/png");
  await putObject(`${base}/signature-transferee.png`, opPng, "image/png");

  const record = signedRecord(
    { note_no: row.note_no, data, operative_id: op.id },
    { vehicle, carrierRegNo: CARRIER_REG_NO, destination: dest, customerSig, operativeSig, signedAt },
  );
  const dataHash = sha256(canonicalJson(record));
  const pdf = await renderNotePdf({
    noteNo: row.note_no,
    data,
    vehicle,
    carrierRegNo: CARRIER_REG_NO,
    destination: dest,
    customerSig: { png: custPng, name: customerSig.name, at: customerSig.at },
    operativeSig: { png: opPng, name: operativeSig.name, at: operativeSig.at },
    generatedAt: signedAt,
    shortHash: dataHash.slice(0, 12),
  });
  const pdfKey = `${base}/${row.note_no}.pdf`;
  await putObject(pdfKey, pdf, "application/pdf");

  const updated = await one<NoteRow>(
    `UPDATE notes SET state = 'signed', signed_at = $2, transfer_at = $3, customer_name = $4, company_name = $5,
       postcode = $6, customer_email = $7, data = $8, data_hash = $9, pdf_key = $10, pdf_sha256 = $11,
       email_requested = $12, email_status = $13, destination = $14, destination_added_at = $15,
       supersedes_id = $16, photo_count = $17
     WHERE id = $1 AND state = 'draft' RETURNING *`,
    [
      row.id,
      signedAt,
      data.transferAt,
      data.customerName,
      data.companyName || null,
      data.postcode,
      data.email || null,
      JSON.stringify({ ...data, _signed: { vehicle, customerSig, operativeSig, carrierRegNo: CARRIER_REG_NO, destination: dest, signedAt } }),
      dataHash,
      pdfKey,
      sha256(pdf),
      input.send,
      input.send ? "pending" : "none",
      dest ? JSON.stringify(dest) : null,
      dest ? signedAt : null,
      supersedes?.id ?? null,
      Math.min(Math.max(0, input.photoCount | 0), MAX_PHOTOS),
    ],
  );
  if (!updated) {
    // Another request signed it first. Return that result.
    const r = (await getByClientId(data.clientId))!;
    return { id: r.id, noteNo: r.note_no, emailStatus: r.email_status, emailRequested: r.email_requested, email: r.customer_email };
  }
  await audit("signed", {
    noteId: row.id,
    operativeId: op.id,
    detail: { dataHash, pdfSha256: sha256(pdf), customerSigAt: customerSig.at, customerSigUa: customerSig.userAgent, operativeSigAt: operativeSig.at, operativeSigUa: operativeSig.userAgent },
  });
  if (supersedes) {
    await query(`UPDATE notes SET superseded_by_id = $2 WHERE id = $1`, [supersedes.id, row.id]);
    await audit("superseded", { noteId: supersedes.id, operativeId: op.id, detail: { by: row.note_no } });
  }

  if (!input.send) {
    await audit("saved_without_sending", { noteId: row.id, operativeId: op.id });
    return { id: row.id, noteNo: row.note_no, emailStatus: "none", emailRequested: false, email: data.email || null };
  }
  const sent = await emailNote(row.id, op);
  return {
    id: row.id,
    noteNo: row.note_no,
    emailStatus: sent.ok ? "sent" : "failed",
    emailRequested: true,
    email: data.email,
    error: sent.ok ? undefined : sent.error,
  };
}

/** Email the stored PDF, unchanged. Used for the first send, retries and resends. */
export async function emailNote(noteId: string, op: Operative, toOverride?: string): Promise<{ ok: boolean; error?: string }> {
  const row = await getNote(noteId);
  if (!row || row.state !== "signed" || !row.pdf_key) throw new HttpError(404, "Note not found.");
  const to = (toOverride ?? row.customer_email ?? "").trim();
  if (!isValidEmail(to)) throw new HttpError(422, "No valid email address for this note.");
  if (toOverride) {
    await query(`UPDATE notes SET customer_email = $2 WHERE id = $1`, [row.id, to]);
    await audit("email_address_set", { noteId: row.id, operativeId: op.id, detail: { to } });
  }
  const pdf = await getObject(row.pdf_key);
  if (row.pdf_sha256 && sha256(pdf) !== row.pdf_sha256) throw new HttpError(500, "The stored PDF does not match its hash. Not sending.");
  const attachments: Attachment[] = [{ filename: `${row.note_no}.pdf`, content: pdf }];
  if (row.destination_pdf_key) attachments.push({ filename: `${row.note_no}-destination.pdf`, content: await getObject(row.destination_pdf_key) });

  await query(`UPDATE notes SET email_requested = true, email_status = 'pending', email_attempts = email_attempts + 1 WHERE id = $1`, [row.id]);
  const r = await sendNoteEmail({ to, noteNo: row.note_no, customerName: row.customer_name ?? "", photoCount: row.photo_count, attachments });
  if (r.ok) {
    await query(`UPDATE notes SET email_status = 'sent', emailed_at = now(), email_last_error = NULL WHERE id = $1`, [row.id]);
    await audit("emailed", { noteId: row.id, operativeId: op.id, detail: { to, providerId: r.id, attachments: attachments.map((a) => a.filename) } });
    return { ok: true };
  }
  await query(`UPDATE notes SET email_status = 'failed', email_last_error = $2 WHERE id = $1`, [row.id, r.error.slice(0, 500)]);
  await audit("email_failed", { noteId: row.id, operativeId: op.id, detail: { to, error: r.error } });
  return { ok: false, error: r.error };
}

// ---------- destination added later ----------

export async function setDestination(op: Operative, noteId: string, siteId: number): Promise<void> {
  const row = await getNote(noteId);
  if (!row || row.state !== "signed") throw new HttpError(404, "Note not found.");
  const dest = (await destinationFor(siteId))!;
  const addedAt = new Date().toISOString();
  const record = { noteNo: row.note_no, originalHash: row.data_hash, destination: dest, addedAt };
  const hash = sha256(canonicalJson(record));
  const pdf = await renderDestinationPdf({
    noteNo: row.note_no,
    originalHash: row.data_hash ?? "",
    destination: dest,
    addedAt,
    generatedAt: addedAt,
    shortHash: hash.slice(0, 12),
  });
  const key = `notes/${row.note_no}/destination-${addedAt.replace(/[:.]/g, "")}.pdf`;
  await putObject(key, pdf, "application/pdf");
  await query(`UPDATE notes SET destination = $2, destination_added_at = $3, destination_pdf_key = $4 WHERE id = $1`, [
    row.id,
    JSON.stringify(dest),
    addedAt,
    key,
  ]);
  await audit(row.destination ? "destination_changed" : "destination_added", {
    noteId: row.id,
    operativeId: op.id,
    detail: { previous: row.destination, destination: dest, recordHash: hash, pdfKey: key },
  });
}

// ---------- photos ----------

export async function addPhoto(op: Operative, clientId: string, idx: number, bytes: Buffer, contentType: string): Promise<void> {
  const row = await getByClientId(clientId);
  if (!row) throw new HttpError(404, "Note not found.");
  assertOwner(op, row);
  if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_PHOTOS) throw new HttpError(400, "Too many photos.");
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) throw new HttpError(400, "Photos must be JPEG, PNG or WebP.");
  if (bytes.length > 3_500_000) throw new HttpError(413, "Photo too large.");
  const exists = await one(`SELECT 1 FROM photos WHERE note_id = $1 AND idx = $2`, [row.id, idx]);
  if (exists) return; // already uploaded, retry is harmless
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `notes/${row.note_no}/photo-${idx + 1}.${ext}`;
  await putObject(key, bytes, contentType);
  await query(
    `INSERT INTO photos (note_id, idx, storage_key, content_type, bytes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [row.id, idx, key, contentType, bytes.length],
  );
  await audit("photo_added", { noteId: row.id, operativeId: op.id, detail: { idx, bytes: bytes.length } });
}

export async function listPhotos(noteId: string) {
  return query<{ idx: number; storage_key: string; content_type: string }>(
    `SELECT idx, storage_key, content_type FROM photos WHERE note_id = $1 ORDER BY idx`,
    [noteId],
  );
}

export { assertOwner };
