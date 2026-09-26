import { requireAdmin } from "@/lib/auth";
import { handle } from "@/lib/api";
import { searchNotes } from "@/lib/search";
import { audit } from "@/lib/audit";
import { badges } from "@/lib/notes";
import { CAPACITIES, CUSTOMER_TYPES, labelOf, sicDisplay, fullDescription, containerText, handlingText, UNITS } from "@/lib/note";
import { formatEwc } from "@/lib/ewc";
import { BUSINESS } from "@/config/offload";

function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per waste line, with the note's fields repeated. Ready for Digital Waste Tracking.
export const GET = handle(async (req: Request) => {
  const op = await requireAdmin();
  const u = new URL(req.url).searchParams;
  const rows = await searchNotes({ q: u.get("q") ?? "", from: u.get("from") ?? "", to: u.get("to") ?? "", status: u.get("status") ?? "", limit: 5000 });
  const head = [
    "note_no", "status", "state", "transfer_at", "signed_at", "operative", "vehicle",
    "transferor_type", "transferor_name", "transferor_company", "transferor_address", "transferor_postcode",
    "transferor_capacity", "transferor_sic", "transferor_email", "transferor_phone",
    "transferee_name", "transferee_address", "transferee_capacity", "transferee_registration",
    "line_no", "description", "ewc_code", "quantity", "unit", "loose_or_container", "container_type", "handling", "pops",
    "hierarchy_confirmed", "destination_name", "destination_address", "destination_permit", "destination_checked", "destination_added_at",
    "email_status", "emailed_at", "photo_count", "supersedes", "superseded_by", "data_hash", "pdf_sha256",
  ];
  const byId = new Map(rows.map((r) => [r.id, r.note_no]));
  const out: string[] = [head.join(",")];
  for (const r of rows) {
    const d: any = r.data ?? {};
    const sg = d._signed ?? {};
    const lines: any[] = d.lines?.length ? d.lines : [null];
    lines.forEach((l, i) => {
      out.push(
        [
          r.note_no, badges(r).join("; "), r.state, r.transfer_at ? new Date(r.transfer_at).toISOString() : "", r.signed_at ? new Date(r.signed_at).toISOString() : "",
          r.operative_name, sg.vehicle ?? "",
          d.customerType ? labelOf(CUSTOMER_TYPES, d.customerType) : "", r.customer_name, r.company_name, d.address, r.postcode,
          d.capacity ? labelOf(CAPACITIES, d.capacity) : "", d.customerType ? sicDisplay(d) : "", r.customer_email, d.phone,
          BUSINESS.TRADING_NAME, [...BUSINESS.ADDRESS_LINES, BUSINESS.POSTCODE].join(", "), BUSINESS.CAPACITY, sg.carrierRegNo ?? "",
          l ? i + 1 : "", l ? fullDescription(l) : "", l ? formatEwc(l.ewc) : "", l?.quantity ?? "", l ? labelOf(UNITS, l.unit) : "",
          l?.packaging ?? "", l ? containerText(l) : "", l ? handlingText(l) : "", l ? (l.pops ? "yes" : "no") : "",
          d.hierarchyConfirmed ? "yes" : "", r.destination?.name, r.destination?.address, r.destination?.permit_no, r.destination?.last_checked,
          r.destination_added_at ? new Date(r.destination_added_at).toISOString() : "",
          r.email_status, r.emailed_at ? new Date(r.emailed_at).toISOString() : "", r.photo_count,
          r.supersedes_id ? byId.get(r.supersedes_id) ?? r.supersedes_id : "", r.superseded_by_id ? byId.get(r.superseded_by_id) ?? r.superseded_by_id : "",
          r.data_hash, r.pdf_sha256,
        ].map(cell).join(","),
      );
    });
  }
  await audit("export_csv", { operativeId: op.id, detail: { rows: rows.length } });
  return new Response("﻿" + out.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="offload-notes-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
