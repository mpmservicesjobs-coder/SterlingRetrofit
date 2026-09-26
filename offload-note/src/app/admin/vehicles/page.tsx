import { requireAdminPage } from "@/lib/auth";
import { query } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import TopBar from "@/components/TopBar";
import AdminNav from "@/components/AdminNav";
import ActionForm from "@/components/ActionForm";
import { vehicleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Vehicles() {
  const op = await requireAdminPage();
  await ensureSeeded();
  const vs = await query<any>(`SELECT * FROM vehicles ORDER BY active DESC, reg`);
  return (
    <>
      <TopBar op={op} title="Office" />
      <main className="wrap wide">
        <AdminNav on="/admin/vehicles" />
        <h1>Vehicles</h1>
        {vs.length === 0 ? <p className="smallprint">No vans yet. Operatives can still type a registration under Other.</p> : null}
        <ul className="list">
          {vs.map((v) => (
            <li key={v.id} className="row">
              <strong>{v.reg}</strong>
              {!v.active ? <span className="badge bad">removed</span> : null}
              <span className="spacer" />
              <ActionForm action={vehicleAction}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="what" value={v.active ? "disable" : "enable"} />
                <button className="btn small secondary">{v.active ? "Remove from list" : "Put back"}</button>
              </ActionForm>
            </li>
          ))}
        </ul>
        <h2 style={{ marginTop: 24 }}>Add vehicle</h2>
        <ActionForm action={vehicleAction} className="row">
          <input type="hidden" name="what" value="add" />
          <input name="reg" type="text" placeholder="Registration" autoCapitalize="characters" required style={{ maxWidth: 240 }} />
          <button className="btn small">Add</button>
        </ActionForm>
      </main>
    </>
  );
}
