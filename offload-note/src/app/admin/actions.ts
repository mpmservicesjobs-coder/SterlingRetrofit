"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, hashPin, isValidPin, nameKey, HttpError } from "@/lib/auth";
import { emailNote, setDestination } from "@/lib/notes";
import { query, one } from "@/lib/db";
import { audit } from "@/lib/audit";

export type ActionState = { ok?: string; error?: string } | null;

async function run(fn: () => Promise<string>): Promise<ActionState> {
  try {
    return { ok: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) return { error: "That already exists." };
    console.error(e);
    return { error: "Something went wrong." };
  }
}

// ---------- notes ----------

export async function resendAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const op = await requireAdmin();
    const id = String(form.get("id"));
    const to = String(form.get("to") ?? "").trim();
    const r = await emailNote(id, op, to || undefined);
    revalidatePath(`/admin/notes/${id}`);
    if (!r.ok) throw new HttpError(502, `Email failed: ${r.error}`);
    return "Sent.";
  });
}

export async function destinationAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const op = await requireAdmin();
    const id = String(form.get("id"));
    const siteId = Number(form.get("siteId"));
    if (!siteId) throw new HttpError(400, "Pick a site.");
    await setDestination(op, id, siteId);
    revalidatePath(`/admin/notes/${id}`);
    return "Destination recorded. A destination record PDF was added. The signed note is unchanged.";
  });
}

// ---------- operatives ----------

export async function addOperativeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const op = await requireAdmin();
    const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
    const pin = String(form.get("pin") ?? "").trim();
    const role = form.get("role") === "admin" ? "admin" : "operative";
    if (name.length < 2) throw new HttpError(400, "Enter a name.");
    if (!isValidPin(pin)) throw new HttpError(400, "PIN must be 4 to 6 digits.");
    const id = randomUUID();
    await query(`INSERT INTO operatives (id, name, name_key, pin_hash, role) VALUES ($1,$2,$3,$4,$5)`, [id, name, nameKey(name), hashPin(pin), role]);
    await audit("operative_added", { operativeId: op.id, detail: { id, name, role } });
    revalidatePath("/admin/operatives");
    return `${name} added.`;
  });
}

export async function updateOperativeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const op = await requireAdmin();
    const id = String(form.get("id"));
    const what = String(form.get("what"));
    const target = await one<any>(`SELECT * FROM operatives WHERE id = $1`, [id]);
    if (!target) throw new HttpError(404, "Not found.");
    if (what === "pin") {
      const pin = String(form.get("pin") ?? "").trim();
      if (!isValidPin(pin)) throw new HttpError(400, "PIN must be 4 to 6 digits.");
      await query(`UPDATE operatives SET pin_hash = $2, failed_pins = 0, locked_until = NULL WHERE id = $1`, [id, hashPin(pin)]);
      await query(`DELETE FROM sessions WHERE operative_id = $1`, [id]);
      await audit("operative_pin_reset", { operativeId: op.id, detail: { id } });
      revalidatePath("/admin/operatives");
      return `PIN reset for ${target.name}. They must log in again.`;
    }
    if (what === "disable" || what === "enable") {
      if (id === op.id) throw new HttpError(400, "You cannot disable yourself.");
      await query(`UPDATE operatives SET active = $2 WHERE id = $1`, [id, what === "enable"]);
      if (what === "disable") await query(`DELETE FROM sessions WHERE operative_id = $1`, [id]);
      await audit(`operative_${what}d`, { operativeId: op.id, detail: { id } });
      revalidatePath("/admin/operatives");
      return `${target.name} ${what}d.`;
    }
    if (what === "role") {
      if (id === op.id) throw new HttpError(400, "You cannot change your own role.");
      const role = target.role === "admin" ? "operative" : "admin";
      await query(`UPDATE operatives SET role = $2 WHERE id = $1`, [id, role]);
      await audit("operative_role", { operativeId: op.id, detail: { id, role } });
      revalidatePath("/admin/operatives");
      return `${target.name} is now ${role}.`;
    }
    throw new HttpError(400, "Unknown action.");
  });
}

// ---------- vehicles ----------

export async function vehicleAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const op = await requireAdmin();
    const what = String(form.get("what"));
    if (what === "add") {
      const reg = String(form.get("reg") ?? "").trim().toUpperCase().replace(/\s+/g, " ");
      if (reg.length < 2) throw new HttpError(400, "Enter the registration.");
      await query(`INSERT INTO vehicles (reg) VALUES ($1) ON CONFLICT (reg) DO UPDATE SET active = true`, [reg]);
      await audit("vehicle_added", { operativeId: op.id, detail: { reg } });
      revalidatePath("/admin/vehicles");
      return `${reg} added.`;
    }
    const id = Number(form.get("id"));
    await query(`UPDATE vehicles SET active = $2 WHERE id = $1`, [id, what === "enable"]);
    await audit(`vehicle_${what}d`, { operativeId: op.id, detail: { id } });
    revalidatePath("/admin/vehicles");
    return "Saved.";
  });
}

// ---------- destination sites ----------

export async function siteAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const op = await requireAdmin();
    const what = String(form.get("what"));
    const id = Number(form.get("id") || 0);
    if (what === "add" || what === "edit") {
      const name = String(form.get("name") ?? "").trim();
      const address = String(form.get("address") ?? "").trim();
      const permit = String(form.get("permit_no") ?? "").trim();
      const checked = String(form.get("last_checked") ?? "").trim() || null;
      if (!name || !address || !permit) throw new HttpError(400, "Name, address and permit or exemption number are all needed.");
      if (checked && !/^\d{4}-\d{2}-\d{2}$/.test(checked)) throw new HttpError(400, "Bad date.");
      if (what === "add") {
        await query(`INSERT INTO sites (name, address, permit_no, last_checked) VALUES ($1,$2,$3,$4)`, [name, address, permit, checked]);
      } else {
        await query(`UPDATE sites SET name = $2, address = $3, permit_no = $4, last_checked = $5 WHERE id = $1`, [id, name, address, permit, checked]);
      }
      await audit(`site_${what === "add" ? "added" : "edited"}`, { operativeId: op.id, detail: { id, name, permit, checked } });
      revalidatePath("/admin/sites");
      return "Saved.";
    }
    if (what === "checked") {
      await query(`UPDATE sites SET last_checked = CURRENT_DATE WHERE id = $1`, [id]);
      await audit("site_checked", { operativeId: op.id, detail: { id } });
      revalidatePath("/admin/sites");
      return "Marked as checked today.";
    }
    await query(`UPDATE sites SET active = $2 WHERE id = $1`, [id, what === "enable"]);
    await audit(`site_${what}d`, { operativeId: op.id, detail: { id } });
    revalidatePath("/admin/sites");
    return "Saved.";
  });
}

export async function correctAction(form: FormData): Promise<void> {
  await requireAdmin();
  redirect(`/new?corrects=${String(form.get("id"))}`);
}
