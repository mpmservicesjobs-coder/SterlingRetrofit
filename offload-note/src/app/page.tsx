import Link from "next/link";
import { requireOperativePage } from "@/lib/auth";
import { searchNotes } from "@/lib/search";
import { badges } from "@/lib/notes";
import { formatDateTime } from "@/lib/time";
import TopBar from "@/components/TopBar";
import Badges from "@/components/Badges";
import HomeClient from "@/components/HomeClient";
import { carrierRegMissing } from "@/config/offload";

export const dynamic = "force-dynamic";

export default async function Home() {
  const op = await requireOperativePage();
  const notes = (await searchNotes({ operativeId: op.id, limit: 20 })).filter((n) => n.state !== "draft");
  return (
    <>
      <TopBar op={op} />
      <main className="wrap">
        {carrierRegMissing() ? (
          <div className="notice danger" role="alert">
            The carrier registration number is not set. Notes cannot be sent until the office adds it.
          </div>
        ) : null}
        <HomeClient />
        {op.role === "admin" ? (
          <p>
            <Link className="btn secondary block" href="/admin">
              Office: all notes
            </Link>
          </p>
        ) : null}
        <h2 style={{ marginTop: 24 }}>My recent notes</h2>
        {notes.length === 0 ? <p className="smallprint">None yet.</p> : null}
        <ul className="list">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={`/notes/${n.id}`} style={{ textDecoration: "none" }}>
                <strong>{n.note_no}</strong> {n.customer_name ? `· ${n.customer_name}` : ""}
                <div className="smallprint">{formatDateTime(n.transfer_at ?? n.created_at)} {n.postcode ?? ""}</div>
                <Badges list={badges(n)} />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
