import { requireAdminPage } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/time";
import TopBar from "@/components/TopBar";
import AdminNav from "@/components/AdminNav";
import ActionForm from "@/components/ActionForm";
import { siteAction } from "../actions";

export const dynamic = "force-dynamic";

function SiteFields({ s }: { s?: any }) {
  return (
    <>
      <div className="field"><label>Name</label><input name="name" type="text" defaultValue={s?.name} required /></div>
      <div className="field"><label>Address</label><input name="address" type="text" defaultValue={s?.address} required /></div>
      <div className="field"><label>Permit or exemption number</label><input name="permit_no" type="text" defaultValue={s?.permit_no} required /></div>
      <div className="field">
        <label>Last checked on the Environment Agency public register</label>
        <input name="last_checked" type="date" defaultValue={s?.last_checked ?? ""} />
      </div>
    </>
  );
}

export default async function Sites() {
  const op = await requireAdminPage();
  const sites = await query<any>(`SELECT id, name, address, permit_no, active, to_char(last_checked,'YYYY-MM-DD') AS last_checked FROM sites ORDER BY active DESC, name`);
  return (
    <>
      <TopBar op={op} title="Office" />
      <main className="wrap wide">
        <AdminNav on="/admin/sites" />
        <h1>Destination sites</h1>
        <p className="smallprint">
          Check each site on the Environment Agency public register (environment.data.gov.uk/public-register) and record the date. Operatives see &quot;Checked on&quot; beside each site.
        </p>
        {sites.map((s) => (
          <details key={s.id} className="card">
            <summary style={{ minHeight: 32 }}>
              <strong>{s.name}</strong> · permit {s.permit_no} · {s.last_checked ? `checked on ${formatDate(s.last_checked)}` : "not checked"}
              {!s.active ? <span className="badge bad" style={{ marginLeft: 8 }}>hidden</span> : null}
            </summary>
            <ActionForm action={siteAction}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="what" value="edit" />
              <SiteFields s={s} />
              <button className="btn small">Save</button>
            </ActionForm>
            <div className="row" style={{ marginTop: 8 }}>
              <ActionForm action={siteAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="what" value="checked" />
                <button className="btn small secondary">Checked today</button>
              </ActionForm>
              <ActionForm action={siteAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="what" value={s.active ? "disable" : "enable"} />
                <button className="btn small secondary">{s.active ? "Hide from operatives" : "Show to operatives"}</button>
              </ActionForm>
            </div>
          </details>
        ))}
        <h2 style={{ marginTop: 24 }}>Add site</h2>
        <ActionForm action={siteAction}>
          <input type="hidden" name="what" value="add" />
          <SiteFields />
          <button className="btn">Add site</button>
        </ActionForm>
      </main>
    </>
  );
}
