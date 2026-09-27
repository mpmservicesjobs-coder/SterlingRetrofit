import { NextResponse } from "next/server";
import { requireOperative } from "@/lib/auth";
import { handle } from "@/lib/api";
import { query } from "@/lib/db";
import { carrierRegMissing } from "@/config/offload";
import { ensureSeeded } from "@/lib/seed";

// Everything the phone needs to fill in a note. Cached on the phone for weak signal.
export const GET = handle(async () => {
  const op = await requireOperative();
  await ensureSeeded();
  const vehicles = await query<{ reg: string }>(`SELECT reg FROM vehicles WHERE active ORDER BY reg`);
  const sites = await query<any>(
    `SELECT id, name, address, permit_no, to_char(last_checked, 'YYYY-MM-DD') AS last_checked FROM sites WHERE active ORDER BY name`,
  );
  return NextResponse.json({
    operative: op,
    vehicles: vehicles.map((v) => v.reg),
    sites,
    carrierRegMissing: carrierRegMissing(),
  });
});
