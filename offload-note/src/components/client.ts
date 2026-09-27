"use client";
// Phone-side storage. Drafts and the send queue live in IndexedDB so a note
// survives no signal, a closed tab or a flat battery. Nothing is dropped
// until the server has confirmed it.

import { BASE_PATH } from "@/lib/paths";
import type { NoteData } from "@/lib/note";

export const apiUrl = (p: string) => `${BASE_PATH}${p}`;

// ---------- tiny IndexedDB wrapper ----------

const DB_NAME = "offload-notes";
const STORES = ["drafts", "outbox", "kv"] as const;
type Store = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDbOnce().catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function openDbOnce(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idbGet = <T>(store: Store, key: string) => tx<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: Store, key: string, value: unknown) => tx(store, "readwrite", (s) => s.put(value, key));
export const idbDel = (store: Store, key: string) => tx(store, "readwrite", (s) => s.delete(key));
export const idbAll = <T>(store: Store) => tx<T[]>(store, "readonly", (s) => s.getAll());

// ---------- app data cache (vans, sites) ----------

export type Site = { id: number; name: string; address: string; permit_no: string; last_checked: string | null };
export type AppData = {
  operative: { id: string; name: string; role: "operative" | "admin" };
  vehicles: string[];
  sites: Site[];
  carrierRegMissing: boolean;
};

export async function loadAppData(): Promise<{ data: AppData | null; offline: boolean; signedOut: boolean }> {
  try {
    const r = await fetch(apiUrl("/api/app-data"), { cache: "no-store" });
    if (r.status === 401) return { data: null, offline: false, signedOut: true };
    if (!r.ok) throw new Error("bad");
    const data = (await r.json()) as AppData;
    await idbPut("kv", "appData", data);
    return { data, offline: false, signedOut: false };
  } catch {
    const cached = await idbGet<AppData>("kv", "appData");
    return { data: cached ?? null, offline: true, signedOut: false };
  }
}

// ---------- drafts ----------

export type Draft = {
  clientId: string;
  step: number;
  data: NoteData;
  photos: Blob[];
  customerSig: { dataUrl: string; at: string } | null;
  operativeSig: { dataUrl: string; at: string } | null;
  updatedAt: string;
};

export const CURRENT_DRAFT_KEY = "currentDraft";

export async function currentDraft(): Promise<Draft | null> {
  const id = await idbGet<string>("kv", CURRENT_DRAFT_KEY);
  if (!id) return null;
  return (await idbGet<Draft>("drafts", id)) ?? null;
}

// Saves run one after another so an older save can never overwrite a newer one.
let saveChain: Promise<void> = Promise.resolve();
export function saveDraft(d: Draft): Promise<void> {
  saveChain = saveChain
    .catch(() => undefined)
    .then(async () => {
      await idbPut("drafts", d.clientId, { ...d, updatedAt: new Date().toISOString() });
      await idbPut("kv", CURRENT_DRAFT_KEY, d.clientId);
    });
  return saveChain;
}

export async function dropDraft(clientId: string): Promise<void> {
  await saveChain.catch(() => undefined);
  await idbDel("drafts", clientId);
  const cur = await idbGet<string>("kv", CURRENT_DRAFT_KEY);
  if (cur === clientId) await idbDel("kv", CURRENT_DRAFT_KEY);
}

// ---------- the send queue ----------

export type OutboxItem = {
  clientId: string;
  noteNo: string | null;
  customerName: string;
  email: string;
  send: boolean;
  payload: {
    data: NoteData;
    customerSig: { dataUrl: string; at: string; userAgent: string };
    operativeSig: { dataUrl: string; at: string; userAgent: string };
    send: boolean;
    photoCount: number;
  };
  photos: Blob[];
  photosDone: number[];
  // queued: not reached the server yet. signed: stored and signed on the server.
  // rejected: the server refused it (see error). signedOut: log in again to send.
  status: "queued" | "signed" | "rejected" | "signedOut";
  emailStatus?: "none" | "pending" | "sent" | "failed";
  noteId?: string;
  error?: string;
  queuedAt: string;
  lastTry?: string;
};

type Listener = () => void;
const listeners = new Set<Listener>();
export function onOutboxChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((f) => f());

export async function enqueue(item: OutboxItem): Promise<void> {
  await idbPut("outbox", item.clientId, item);
  notify();
}

export async function outbox(): Promise<OutboxItem[]> {
  const all = await idbAll<OutboxItem>("outbox");
  return all.sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
}

export async function forget(clientId: string): Promise<void> {
  await idbDel("outbox", clientId);
  notify();
}

let running: Promise<void> | null = null;

/** Try to send everything waiting. Safe to call often. */
export function processOutbox(): Promise<void> {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

async function run(): Promise<void> {
  for (const item of await outbox()) {
    if (item.status === "rejected") continue;
    if (item.status === "signed" && item.photosDone.length >= item.photos.length) continue;
    try {
      if (item.status !== "signed") {
        item.lastTry = new Date().toISOString();
        const r = await fetch(apiUrl("/api/notes/submit"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 401) {
          item.status = "signedOut";
          item.error = "Logged out. Log in again to send this note.";
        } else if (r.ok) {
          item.status = "signed";
          item.noteNo = j.noteNo;
          item.noteId = j.id;
          item.emailStatus = j.emailStatus;
          item.error = j.error;
        } else if (r.status >= 500 || r.status === 429) {
          item.status = "queued";
          item.error = j.error || `Server error ${r.status}. Will try again.`;
        } else {
          item.status = "rejected";
          item.error = j.error || `Refused (${r.status}).`;
        }
        await idbPut("outbox", item.clientId, item);
        notify();
      }
      if (item.status === "signed") {
        for (let i = 0; i < item.photos.length; i++) {
          if (item.photosDone.includes(i)) continue;
          const f = new FormData();
          f.set("clientId", item.clientId);
          f.set("idx", String(i));
          f.set("file", item.photos[i], `photo-${i + 1}.jpg`);
          const r = await fetch(apiUrl("/api/notes/photo"), { method: "POST", body: f });
          if (!r.ok) break;
          item.photosDone.push(i);
          await idbPut("outbox", item.clientId, item);
          notify();
        }
      }
    } catch {
      // No signal. Leave it queued; we try again when back online.
      item.error = "No signal. Waiting to send.";
      if (item.status === "signedOut") item.status = "queued";
      await idbPut("outbox", item.clientId, item);
      notify();
    }
  }
}

/** Remove fully finished items after a day so the list stays short. */
export async function tidyOutbox(): Promise<void> {
  const cut = Date.now() - 86_400_000;
  for (const i of await outbox()) {
    if (i.status === "signed" && i.photosDone.length >= i.photos.length && Date.parse(i.queuedAt) < cut) await idbDel("outbox", i.clientId);
  }
}

// ---------- photos ----------

/** Shrinks a camera photo to at most 1600px on the long side, JPEG. */
export async function compressPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (!bmp) return file;
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.72));
}

export function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
