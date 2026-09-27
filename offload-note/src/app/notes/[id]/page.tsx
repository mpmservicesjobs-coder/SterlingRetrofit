import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOperativePage } from "@/lib/auth";
import { getNote, badges } from "@/lib/notes";
import { formatDateTime } from "@/lib/time";
import TopBar from "@/components/TopBar";
import Badges from "@/components/Badges";

export const dynamic = "force-dynamic";

export default async function NoteView({ params }: { params: Promise<{ id: string }> }) {
  const op = await requireOperativePage();
  const { id } = await params;
  const n = await getNote(id);
  if (!n) notFound();
  if (op.role === "admin") redirect(`/admin/notes/${n.id}`);
  if (n.operative_id !== op.id) notFound();
  return (
    <>
      <TopBar op={op} />
      <main className="wrap">
        <h1>{n.note_no}</h1>
        <Badges list={badges(n)} />
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Customer</dt>
          <dd>{n.customer_name ?? ""}</dd>
          <dt>Postcode</dt>
          <dd>{n.postcode ?? ""}</dd>
          <dt>Transfer</dt>
          <dd>{n.transfer_at ? formatDateTime(n.transfer_at) : ""}</dd>
          <dt>Email</dt>
          <dd>{n.customer_email ?? "None"}</dd>
          <dt>Destination</dt>
          <dd>{n.destination?.name ?? "Not added yet"}</dd>
        </dl>
        {n.pdf_key ? (
          <p style={{ marginTop: 16 }}>
            <a className="btn block" href={`/note/api/notes/${n.id}/pdf`} target="_blank" rel="noreferrer">
              Open PDF
            </a>
          </p>
        ) : null}
        <p className="smallprint">Need a correction? Call the office. Signed notes are never edited.</p>
        <Link href="/">Back</Link>
      </main>
    </>
  );
}
