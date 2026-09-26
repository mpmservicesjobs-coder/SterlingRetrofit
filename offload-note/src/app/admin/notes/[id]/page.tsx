import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { getNote, badges, listPhotos, verifyHash, eligibleForDeletion } from "@/lib/notes";
import { query } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/time";
import TopBar from "@/components/TopBar";
import Badges from "@/components/Badges";
import AdminNav from "@/components/AdminNav";
import ActionForm from "@/components/ActionForm";
import { resendAction, destinationAction, correctAction } from "../../actions";
import { CAPACITIES, CUSTOMER_TYPES, containerText, fullDescription, handlingText, labelOf, quantityText, sicDisplay } from "@/lib/note";
import { formatEwc } from "@/lib/ewc";
import { RETENTION_YEARS } from "@/config/offload";

export const dynamic = "force-dynamic";

export default async function AdminNote({ params }: { params: Promise<{ id: string }> }) {
  const op = await requireAdminPage();
  const { id } = await params;
  const n = await getNote(id);
  if (!n) notFound();
  const d: any = n.data ?? {};
  const photos = await listPhotos(n.id);
  const trail = await query<any>(
    `SELECT a.*, o.name AS who FROM audit_log a LEFT JOIN operatives o ON o.id = a.operative_id WHERE a.note_id = $1 ORDER BY a.at`,
    [n.id],
  );
  const sites = await query<any>(`SELECT id, name, permit_no, to_char(last_checked,'YYYY-MM-DD') AS last_checked FROM sites WHERE active ORDER BY name`);
  const related = await query<{ id: string; note_no: string }>(`SELECT id, note_no FROM notes WHERE id = ANY($1::uuid[])`, [
    [n.supersedes_id, n.superseded_by_id].filter(Boolean),
  ]);
  const rel = (x: string | null) => related.find((r) => r.id === x);
  const signed = n.state === "signed";
  const hashOk = signed ? verifyHash(n) : null;

  return (
    <>
      <TopBar op={op} title="Office" />
      <main className="wrap wide">
        <AdminNav on="/admin" />
        <div className="row">
          <h1 style={{ margin: 0 }}>{n.note_no}</h1>
          <Badges list={badges(n)} />
        </div>
        {n.superseded_by_id ? (
          <div className="notice warn">
            Superseded by <Link href={`/admin/notes/${n.superseded_by_id}`}>{rel(n.superseded_by_id)?.note_no ?? "a later note"}</Link>.
          </div>
        ) : null}
        {n.supersedes_id ? (
          <div className="notice ok">
            Corrects <Link href={`/admin/notes/${n.supersedes_id}`}>{rel(n.supersedes_id)?.note_no ?? "an earlier note"}</Link>.
          </div>
        ) : null}
        {signed && !hashOk ? <div className="notice danger">The stored data does not match the hash printed on the PDF. Treat the PDF as the record.</div> : null}
        {signed && eligibleForDeletion(n) ? (
          <div className="notice warn">Older than {RETENTION_YEARS} years: eligible for deletion. Nothing is deleted automatically. Keeping it longer is recommended.</div>
        ) : null}

        {signed ? (
          <div className="row" style={{ margin: "12px 0" }}>
            <a className="btn small" href={`/note/api/notes/${n.id}/pdf`} target="_blank" rel="noreferrer">Open signed PDF</a>
            {n.destination_pdf_key ? (
              <a className="btn small secondary" href={`/note/api/notes/${n.id}/pdf?which=destination`} target="_blank" rel="noreferrer">Destination record PDF</a>
            ) : null}
          </div>
        ) : null}

        <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
          <section style={{ flex: "1 1 420px" }}>
            <h2>Details</h2>
            <dl className="kv">
              <dt>State</dt><dd>{n.state}</dd>
              <dt>Operative</dt><dd>{n.operative_name}</dd>
              <dt>Vehicle</dt><dd>{d._signed?.vehicle ?? ""}</dd>
              <dt>Transfer</dt><dd>{n.transfer_at ? formatDateTime(n.transfer_at) : ""}</dd>
              <dt>Signed</dt><dd>{n.signed_at ? formatDateTime(n.signed_at) : "Not signed"}</dd>
              <dt>Customer</dt><dd>{n.customer_name} {n.company_name ? `(${n.company_name})` : ""}</dd>
              <dt>Type</dt><dd>{d.customerType ? labelOf(CUSTOMER_TYPES, d.customerType) : ""}</dd>
              <dt>Capacity</dt><dd>{d.capacity ? labelOf(CAPACITIES, d.capacity) : ""}</dd>
              <dt>SIC</dt><dd>{d.customerType ? sicDisplay(d) : ""}</dd>
              <dt>Address</dt><dd>{d.address} {n.postcode}</dd>
              <dt>Email</dt><dd>{n.customer_email ?? "None"}</dd>
              <dt>Phone</dt><dd>{d.phone || "None"}</dd>
              <dt>Email status</dt><dd>{n.email_status}{n.email_attempts ? ` (${n.email_attempts} tries)` : ""}{n.email_last_error ? `: ${n.email_last_error}` : ""}</dd>
              <dt>Data hash</dt><dd style={{ wordBreak: "break-all", fontSize: 13 }}>{n.data_hash ?? ""} {signed ? (hashOk ? "(matches)" : "(DOES NOT MATCH)") : ""}</dd>
            </dl>
            {d.lines?.length ? (
              <>
                <h3 style={{ marginTop: 16 }}>Waste</h3>
                <div className="scroll-x">
                  <table className="data">
                    <thead><tr><th>Description</th><th>EWC</th><th>Quantity</th><th>Loose or container</th><th>Handling</th></tr></thead>
                    <tbody>
                      {d.lines.map((l: any) => (
                        <tr key={l.id}>
                          <td>{fullDescription(l)}</td>
                          <td>{formatEwc(l.ewc)}</td>
                          <td>{quantityText(l)}</td>
                          <td>{containerText(l)}</td>
                          <td>{handlingText(l)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>

          <section style={{ flex: "1 1 320px" }}>
            {signed ? (
              <>
                <h2>Email</h2>
                <ActionForm action={resendAction}>
                  <input type="hidden" name="id" value={n.id} />
                  {n.customer_email ? (
                    <p>Sends the same stored PDF to {n.customer_email}.</p>
                  ) : (
                    <div className="field">
                      <label htmlFor="to">Customer email</label>
                      <input id="to" name="to" type="email" required />
                    </div>
                  )}
                  <button className="btn small">{n.email_status === "sent" ? "Resend" : n.email_status === "failed" ? "Retry" : "Send"}</button>
                </ActionForm>

                <h2 style={{ marginTop: 20 }}>Destination</h2>
                {n.destination ? (
                  <p>
                    {n.destination.name}, {n.destination.address}. Permit {n.destination.permit_no}.{" "}
                    {n.destination.last_checked ? `Checked on ${formatDate(n.destination.last_checked)}.` : ""} Added{" "}
                    {n.destination_added_at ? formatDateTime(n.destination_added_at) : ""}.
                  </p>
                ) : (
                  <div className="notice warn">Destination missing. The note is not complete until it is added.</div>
                )}
                <ActionForm action={destinationAction} confirmText="Record this destination? This adds a destination record. The signed note does not change.">
                  <input type="hidden" name="id" value={n.id} />
                  <div className="field">
                    <label htmlFor="siteId">{n.destination ? "Change site" : "Add site"}</label>
                    <select id="siteId" name="siteId" required defaultValue="">
                      <option value="" disabled>Pick a site</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.permit_no}){s.last_checked ? `, checked ${formatDate(s.last_checked)}` : ", not checked"}
                        </option>
                      ))}
                    </select>
                    <div className="hint"><Link href="/admin/sites">Manage sites</Link></div>
                  </div>
                  <button className="btn small">Save destination</button>
                </ActionForm>

                {!n.superseded_by_id ? (
                  <>
                    <h2 style={{ marginTop: 20 }}>Correction</h2>
                    <p className="smallprint">A signed note is never edited. A correction is a new note, signed again, that replaces this one.</p>
                    <form action={correctAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <button className="btn small secondary">Start a correction</button>
                    </form>
                  </>
                ) : null}
              </>
            ) : null}

            <h2 style={{ marginTop: 20 }}>Photos</h2>
            {photos.length ? (
              <div className="photos">
                {photos.map((p) => (
                  <a key={p.idx} href={`/note/api/notes/${n.id}/photo/${p.idx}`} target="_blank" rel="noreferrer">
                    <img src={`/note/api/notes/${n.id}/photo/${p.idx}`} alt={`Photo ${p.idx + 1}`} />
                  </a>
                ))}
              </div>
            ) : (
              <p className="smallprint">No photos{n.photo_count ? ` yet (${n.photo_count} expected from the phone)` : ""}.</p>
            )}
          </section>
        </div>

        <h2 style={{ marginTop: 24 }}>Audit trail</h2>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>When</th><th>What</th><th>Who</th><th>Detail</th></tr></thead>
            <tbody>
              {trail.map((a) => (
                <tr key={a.id}>
                  <td>{formatDateTime(a.at)}</td>
                  <td>{a.action.replace(/_/g, " ")}</td>
                  <td>{a.who ?? ""}</td>
                  <td style={{ fontSize: 13, wordBreak: "break-word" }}>
                    {a.detail ? JSON.stringify(a.detail) : ""}
                    <div className="smallprint">{a.ip} {a.user_agent}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
