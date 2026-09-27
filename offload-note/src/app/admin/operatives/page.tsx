import { requireAdminPage } from "@/lib/auth";
import { query } from "@/lib/db";
import TopBar from "@/components/TopBar";
import AdminNav from "@/components/AdminNav";
import ActionForm from "@/components/ActionForm";
import { addOperativeAction, updateOperativeAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Operatives() {
  const op = await requireAdminPage();
  const ops = await query<any>(`SELECT id, name, role, active, locked_until FROM operatives ORDER BY active DESC, name`);
  return (
    <>
      <TopBar op={op} title="Office" />
      <main className="wrap wide">
        <AdminNav on="/admin/operatives" />
        <h1>Operatives</h1>
        <ul className="list">
          {ops.map((o) => (
            <li key={o.id}>
              <div className="row">
                <strong>{o.name}</strong>
                <span className="badge">{o.role}</span>
                {!o.active ? <span className="badge bad">disabled</span> : null}
                {o.locked_until && new Date(o.locked_until) > new Date() ? <span className="badge warn">locked</span> : null}
              </div>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <ActionForm action={updateOperativeAction} className="row">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="what" value="pin" />
                  <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" placeholder="New PIN" style={{ width: 140 }} required />
                  <button className="btn small secondary">Reset PIN</button>
                </ActionForm>
                {o.id !== op.id ? (
                  <>
                    <ActionForm action={updateOperativeAction} confirmText={o.active ? `Disable ${o.name}? They are logged out at once.` : undefined}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="what" value={o.active ? "disable" : "enable"} />
                      <button className="btn small secondary">{o.active ? "Disable" : "Enable"}</button>
                    </ActionForm>
                    <ActionForm action={updateOperativeAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="what" value="role" />
                      <button className="btn small secondary">{o.role === "admin" ? "Make operative" : "Make admin"}</button>
                    </ActionForm>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <h2 style={{ marginTop: 24 }}>Add operative</h2>
        <ActionForm action={addOperativeAction}>
          <div className="field"><label htmlFor="n">Name</label><input id="n" name="name" type="text" required /></div>
          <div className="field">
            <label htmlFor="p">PIN</label>
            <input id="p" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" required />
            <div className="hint">4 to 6 digits. Tell them in person, not by text.</div>
          </div>
          <div className="field">
            <label htmlFor="r">Role</label>
            <select id="r" name="role" defaultValue="operative">
              <option value="operative">Operative (own notes)</option>
              <option value="admin">Admin (all notes, settings)</option>
            </select>
          </div>
          <button className="btn">Add operative</button>
        </ActionForm>
      </main>
    </>
  );
}
