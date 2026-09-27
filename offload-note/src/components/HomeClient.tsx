"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Draft,
  OutboxItem,
  apiUrl,
  currentDraft,
  dropDraft,
  enqueue,
  forget,
  onOutboxChange,
  outbox,
  processOutbox,
  tidyOutbox,
} from "./client";

export function OutboxStatus({ item }: { item: OutboxItem }) {
  const photos =
    item.photos.length > 0 ? (
      <div className="smallprint">
        Photos uploaded: {item.photosDone.length} of {item.photos.length}
        {item.photosDone.length < item.photos.length ? ". The rest upload when you have signal." : ""}
      </div>
    ) : null;
  if (item.status === "queued")
    return (
      <div className="notice warn" role="status">
        <strong>NOT SENT YET.</strong> Queued on this phone. It sends by itself when you have signal. Do not tell the customer it has gone.
        {item.error ? <div className="smallprint">{item.error}</div> : null}
      </div>
    );
  if (item.status === "signedOut")
    return (
      <div className="notice warn">
        <strong>NOT SENT YET.</strong> You are logged out. <Link href="/login">Log in</Link> and it will send.
      </div>
    );
  if (item.status === "rejected")
    return (
      <div className="notice danger" role="alert">
        <strong>NOT SENT.</strong> {item.error}
      </div>
    );
  if (item.emailStatus === "sent")
    return (
      <div className="notice ok">
        Sent to <strong>{item.email}</strong>.{photos}
      </div>
    );
  if (item.emailStatus === "failed" || item.emailStatus === "pending")
    return (
      <div className="notice danger" role="alert">
        <strong>Note saved and signed, but the email did not go.</strong> {item.error ?? ""} It is in the office&apos;s not delivered queue for a retry.
        {photos}
      </div>
    );
  return (
    <div className="notice ok">
      Saved. Not emailed. The office can send it later.{photos}
    </div>
  );
}

export default function HomeClient() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [items, setItems] = useState<OutboxItem[]>([]);

  useEffect(() => {
    const refresh = async () => setItems(await outbox());
    currentDraft().then(setDraft);
    tidyOutbox().then(refresh);
    const off = onOutboxChange(refresh);
    processOutbox();
    const online = () => processOutbox();
    window.addEventListener("online", online);
    const t = setInterval(() => processOutbox(), 30_000);
    return () => {
      off();
      window.removeEventListener("online", online);
      clearInterval(t);
    };
  }, []);

  async function startNew() {
    if (draft) {
      if (!confirm("You have a note in progress. Throw it away and start a new one?")) return;
      fetch(apiUrl("/api/notes/cancel"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: draft.clientId, reason: "Discarded on phone" }),
      }).catch(() => null);
      await dropDraft(draft.clientId);
    }
    router.push("/new?fresh=1");
  }

  const waiting = items.filter((i) => i.status !== "signed");

  return (
    <section>
      {waiting.length > 0 ? (
        <div className="notice warn" role="status">
          <strong>
            {waiting.length} note{waiting.length === 1 ? "" : "s"} not sent yet.
          </strong>{" "}
          Keep the app open when you have signal.
        </div>
      ) : null}

      {draft ? (
        <div className="card surface">
          <div className="label">Note in progress</div>
          <p>
            {draft.data.noteNo ?? "Number pending"} · {draft.data.customerName || "No customer yet"} · step {draft.step} of 8
          </p>
          <Link className="btn block big" href="/new">
            Continue note
          </Link>
          <button className="linkbtn" onClick={startNew}>
            Start a different note
          </button>
        </div>
      ) : (
        <button className="btn block big" onClick={startNew}>
          New transfer note
        </button>
      )}

      {items.length > 0 ? (
        <>
          <h2 style={{ marginTop: 24 }}>On this phone</h2>
          <ul className="list">
            {items.map((i) => (
              <li key={i.clientId}>
                <div className="row">
                  <strong>{i.noteNo ?? "Number pending"}</strong>
                  <span>{i.customerName}</span>
                </div>
                <OutboxStatus item={i} />
                <div className="row">
                  {i.status === "queued" || i.status === "signedOut" ? (
                    <button className="btn small" onClick={() => processOutbox()}>
                      Try now
                    </button>
                  ) : null}
                  {i.status === "rejected" ? (
                    <>
                      <button
                        className="btn small"
                        onClick={async () => {
                          await enqueue({ ...i, status: "queued", error: undefined });
                          processOutbox();
                        }}
                      >
                        Try again
                      </button>
                      <button
                        className="linkbtn"
                        onClick={async () => {
                          if (confirm("Remove this unsent note from the phone? It has NOT been saved by the office.")) await forget(i.clientId);
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                  {i.noteId ? (
                    <Link className="linkbtn" href={`/notes/${i.noteId}`}>
                      View note
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
