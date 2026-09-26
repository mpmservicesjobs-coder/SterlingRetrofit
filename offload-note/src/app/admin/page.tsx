import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { searchNotes } from "@/lib/search";
import { badges } from "@/lib/notes";
import { formatDateTime } from "@/lib/time";
import TopBar from "@/components/TopBar";
import Badges from "@/components/Badges";
import AdminNav from "@/components/AdminNav";
import { carrierRegMissing } from "@/config/offload";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUSES = [
  ["", "Any status"],
  ["not_delivered", "Not delivered"],
  ["not_emailed", "Not emailed"],
  ["destination_missing", "Destination missing"],
  ["complete", "Complete"],
  ["draft", "Draft"],
  ["superseded", "Superseded"],
  ["cancelled", "Cancelled"],
];

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const op = await requireAdminPage();
  const sp = await searchParams;
  const f = { q: sp.q ?? "", from: sp.from ?? "", to: sp.to ?? "", status: sp.status ?? "" };
  const notes = await searchNotes(f);
  const counts = (
    await query<{ k: string; n: string }>(
      `SELECT 'not_delivered' AS k, count(*)::text AS n FROM notes WHERE state = 'signed' AND email_requested AND email_status <> 'sent'
       UNION ALL SELECT 'destination_missing', count(*)::text FROM notes WHERE state = 'signed' AND destination IS NULL
       UNION ALL SELECT 'not_emailed', count(*)::text FROM notes WHERE state = 'signed' AND NOT email_requested`,
    )
  ).reduce<Record<string, number>>((a, r) => ({ ...a, [r.k]: Number(r.n) }), {});
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <TopBar op={op} title="Office" />
      <main className="wrap wide">
        <AdminNav on="/admin" />
        {carrierRegMissing() ? (
          <div className="notice danger">CARRIER_REG_NO is empty in src/config/offload.ts. No note can be sent until it is set.</div>
        ) : null}
        <div className="row" style={{ marginBottom: 12 }}>
          {counts.not_delivered ? (
            <Link className="badge bad" href="/admin?status=not_delivered">
              {counts.not_delivered} not delivered
            </Link>
          ) : null}
          {counts.destination_missing ? (
            <Link className="badge warn" href="/admin?status=destination_missing">
              {counts.destination_missing} destination missing
            </Link>
          ) : null}
          {counts.not_emailed ? (
            <Link className="badge warn" href="/admin?status=not_emailed">
              {counts.not_emailed} not emailed
            </Link>
          ) : null}
        </div>
        <form className="filters" method="get">
          <div>
            <label className="label" htmlFor="q">Search</label>
            <input id="q" name="q" type="search" defaultValue={f.q} placeholder="Name, postcode or note number" />
          </div>
          <div>
            <label className="label" htmlFor="from">From</label>
            <input id="from" name="from" type="date" defaultValue={f.from} />
          </div>
          <div>
            <label className="label" htmlFor="to">To</label>
            <input id="to" name="to" type="date" defaultValue={f.to} />
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={f.status}>
              {STATUSES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <button className="btn small">Search</button>
          <a className="btn small secondary" href={`/note/api/admin/export${qs ? `?${qs}` : ""}`}>
            Export CSV
          </a>
        </form>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Postcode</th>
                <th>Operative</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id}>
                  <td>
                    <Link href={`/admin/notes/${n.id}`}><strong>{n.note_no}</strong></Link>
                  </td>
                  <td>{formatDateTime(n.transfer_at ?? n.created_at)}</td>
                  <td>
                    {n.customer_name ?? ""}
                    {n.company_name ? <div className="smallprint">{n.company_name}</div> : null}
                  </td>
                  <td>{n.postcode ?? ""}</td>
                  <td>{n.operative_name}</td>
                  <td><Badges list={badges(n)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {notes.length === 0 ? <p className="smallprint">No notes match.</p> : null}
        </div>
      </main>
    </>
  );
}
