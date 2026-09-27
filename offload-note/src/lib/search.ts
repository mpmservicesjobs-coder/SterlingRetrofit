import "server-only";
import { query } from "./db";
import { NoteRow } from "./notes";

export type NoteFilter = { q?: string; from?: string; to?: string; status?: string; operativeId?: string; limit?: number };

export async function searchNotes(f: NoteFilter): Promise<NoteRow[]> {
  const where: string[] = [];
  const p: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    p.push(v);
    where.push(sql.replace("?", `$${p.length}`));
  };
  if (f.q?.trim()) {
    const q = `%${f.q.trim().toLowerCase()}%`;
    const qpc = `%${f.q.trim().toLowerCase().replace(/\s+/g, "")}%`;
    p.push(q, qpc);
    const a = p.length - 1;
    where.push(
      `(lower(n.note_no) LIKE $${a} OR lower(coalesce(n.customer_name,'')) LIKE $${a} OR lower(coalesce(n.company_name,'')) LIKE $${a}
        OR lower(replace(coalesce(n.postcode,''),' ','')) LIKE $${a + 1} OR lower(coalesce(n.customer_email,'')) LIKE $${a})`,
    );
  }
  if (f.from) add(`coalesce(n.transfer_at, n.created_at) >= ?::date`, f.from);
  if (f.to) add(`coalesce(n.transfer_at, n.created_at) < (?::date + 1)`, f.to);
  if (f.operativeId) add(`n.operative_id = ?`, f.operativeId);
  switch (f.status) {
    case "draft": where.push(`n.state = 'draft'`); break;
    case "cancelled": where.push(`n.state = 'cancelled'`); break;
    case "signed": where.push(`n.state = 'signed'`); break;
    case "not_delivered": where.push(`n.state = 'signed' AND n.email_requested AND n.email_status <> 'sent'`); break;
    case "not_emailed": where.push(`n.state = 'signed' AND NOT n.email_requested`); break;
    case "destination_missing": where.push(`n.state = 'signed' AND n.destination IS NULL`); break;
    case "complete": where.push(`n.state = 'signed' AND n.destination IS NOT NULL`); break;
    case "superseded": where.push(`n.superseded_by_id IS NOT NULL`); break;
  }
  const sql = `SELECT n.*, o.name AS operative_name FROM notes n JOIN operatives o ON o.id = n.operative_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY n.created_at DESC LIMIT ${Math.min(f.limit ?? 200, 5000)}`;
  return query<NoteRow>(sql, p);
}
