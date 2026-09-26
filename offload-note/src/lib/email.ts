import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import { BUSINESS, CARRIER_REG_NO, EMAIL_BCC, EMAIL_FROM, EMAIL_REPLY_TO } from "@/config/offload";

export type Attachment = { filename: string; content: Buffer };

export type NoteEmail = {
  to: string;
  noteNo: string;
  customerName: string;
  photoCount: number;
  attachments: Attachment[];
};

export function noteEmailSubject(noteNo: string): string {
  return `Your waste transfer note ${noteNo}`;
}

/** Plain, short, no marketing, no em dashes. */
export function noteEmailText(e: Omit<NoteEmail, "to" | "attachments">): string {
  const first = e.customerName.trim().split(/\s+/)[0] || "there";
  const lines = [
    `Hello ${first},`,
    "",
    `Thank you for using ${BUSINESS.TRADING_NAME}. Your waste transfer note ${e.noteNo} is attached as a PDF.`,
    "",
    "Please keep it for at least 2 years. You may be asked to show it.",
  ];
  if (e.photoCount > 0) {
    lines.push("", `We took ${e.photoCount} photo${e.photoCount === 1 ? "" : "s"} of the waste. We keep ${e.photoCount === 1 ? "it" : "them"} with our copy of the note.`);
  }
  lines.push(
    "",
    `Our waste carrier registration number is ${CARRIER_REG_NO}.`,
    "",
    `Questions? Call or WhatsApp ${BUSINESS.PHONE}, or reply to this email.`,
    "",
    BUSINESS.TRADING_NAME,
    `${BUSINESS.PHONE} | ${BUSINESS.EMAIL}`,
  );
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendNoteEmail(e: NoteEmail): Promise<SendResult> {
  const text = noteEmailText(e);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${text
    .split("\n\n")
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") return { ok: false, error: "Email is not set up (RESEND_API_KEY missing)." };
    // Development: write the email to .data/outbox instead of sending it.
    const dir = path.join(/* turbopackIgnore: true */ process.cwd(), process.env.LOCAL_OUTBOX_DIR || ".data/outbox", e.noteNo);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "email.json"),
      JSON.stringify({ from: EMAIL_FROM, to: e.to, bcc: EMAIL_BCC, replyTo: EMAIL_REPLY_TO, subject: noteEmailSubject(e.noteNo), text }, null, 2),
    );
    for (const a of e.attachments) await fs.writeFile(path.join(dir, a.filename), a.content);
    if (process.env.FAKE_EMAIL_FAIL) return { ok: false, error: "Simulated failure" };
    return { ok: true, id: `local-${Date.now()}` };
  }
  try {
    const resend = new Resend(key);
    const r = await resend.emails.send({
      from: EMAIL_FROM,
      to: [e.to],
      bcc: [EMAIL_BCC],
      replyTo: EMAIL_REPLY_TO,
      subject: noteEmailSubject(e.noteNo),
      text,
      html,
      attachments: e.attachments.map((a) => ({ filename: a.filename, content: a.content })),
    });
    if (r.error) return { ok: false, error: r.error.message };
    return { ok: true, id: r.data?.id ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
