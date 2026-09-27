"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AppData,
  Draft,
  OutboxItem,
  apiUrl,
  compressPhoto,
  currentDraft,
  dropDraft,
  enqueue,
  loadAppData,
  onOutboxChange,
  outbox,
  processOutbox,
  saveDraft,
  uuid,
} from "./client";
import {
  CAPACITIES,
  CONTAINERS,
  CUSTOMER_TYPES,
  Errors,
  NoteData,
  POPS_CHEMICALS,
  POPS_DESCRIPTION,
  POPS_EWC,
  POPS_WARNING,
  SIC_NOT_APPLICABLE,
  UNITS,
  WasteLine,
  containerText,
  detectPops,
  emptyNote,
  handlingText,
  isInServiceArea,
  isValidPostcode,
  labelOf,
  newLine,
  normalisePostcode,
  quantityText,
  sicRequired,
  validateForSubmit,
  validateLine,
  validateStep,
} from "@/lib/note";
import { formatEwc } from "@/lib/ewc";
import { formatDate, formatDateTime, fromLocalInput, toLocalInput } from "@/lib/time";
import { BUSINESS, CARRIER_REG_NO, HIERARCHY_STATEMENT, HOUSEHOLDER_NOTE, MAX_PHOTOS, REFUSED_ITEMS } from "@/config/offload";
import SignaturePad from "./SignaturePad";
import EwcPicker from "./EwcPicker";
import { OutboxStatus } from "./HomeClient";

const TITLES = ["Job", "Customer", "The waste", "Waste hierarchy", "Offload details", "Destination", "Photos", "Sign and send"];

// ---------- small form pieces ----------

function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  two,
}: {
  label: string;
  options: { value: T; label: string; sub?: string }[];
  value: string;
  onChange: (v: T) => void;
  error?: string;
  two?: boolean;
}) {
  return (
    <fieldset className={`field ${error ? "invalid" : ""}`} style={{ border: 0, padding: 0, margin: "0 0 18px" }}>
      <legend className="label">{label}</legend>
      <div className={`choices ${two ? "two" : ""}`}>
        {options.map((o) => (
          <label key={o.value} className={`choice ${value === o.value ? "on" : ""}`}>
            <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              {o.label}
              {o.sub ? <small>{o.sub}</small> : null}
            </span>
          </label>
        ))}
      </div>
      {error ? <div className="err">{error}</div> : null}
    </fieldset>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`choice ${checked ? "on" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function RefuseList() {
  return (
    <details className="card">
      <summary style={{ fontWeight: 700, minHeight: 32 }}>What we do not take</summary>
      <ul>
        {REFUSED_ITEMS.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </details>
  );
}

// ---------- one waste line ----------

function LineEditor({
  line,
  index,
  errors,
  onChange,
  onRemove,
  onHazardous,
  canRemove,
}: {
  line: WasteLine;
  index: number;
  errors: Errors;
  onChange: (l: WasteLine) => void;
  onRemove: () => void;
  onHazardous: (code: string) => void;
  canRemove: boolean;
}) {
  const e = (k: string) => errors[`lines.${index}.${k}`];
  const set = (p: Partial<WasteLine>) => onChange({ ...line, ...p });
  const match = line.pops ? "no" : detectPops(line.description);

  function applyPops() {
    const extra = line.description.trim();
    const desc = extra && !/containing pops/i.test(extra) ? `${POPS_DESCRIPTION}: ${extra}` : extra || POPS_DESCRIPTION;
    set({ pops: true, ewc: POPS_EWC, description: desc, noMix: true });
  }

  return (
    <div className="card" data-line={index}>
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Waste {index + 1}</h3>
        <span className="spacer" />
        {canRemove ? (
          <button type="button" className="linkbtn" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>

      <Check
        label="Sofa, armchair or other upholstered domestic seating"
        checked={line.pops}
        onChange={(v) => (v ? applyPops() : set({ pops: false }))}
      />
      <div style={{ height: 12 }} />

      <Field label="What is it?" error={e("description")} htmlFor={`desc-${line.id}`}>
        <textarea
          id={`desc-${line.id}`}
          value={line.description}
          placeholder="For example: mixed household clearance of furniture, cardboard and bags"
          onChange={(ev) => set({ description: ev.target.value })}
          onBlur={() => {
            if (!line.pops && detectPops(line.description) === "yes") applyPops();
          }}
        />
      </Field>

      {match === "maybe" ? (
        <div className="notice warn">
          Is this seating with foam, fabric or leather (upholstered)? If yes it is POPs waste.
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={applyPops}>
              Yes, it is upholstered
            </button>
          </div>
        </div>
      ) : null}

      {line.pops ? (
        <>
          <div className="card locked">
            <div className="label">Added to the description (cannot be removed)</div>
            <p style={{ margin: 0 }}>{POPS_CHEMICALS}</p>
          </div>
          <div className="notice danger" role="alert">
            <strong>{POPS_WARNING}</strong>
          </div>
        </>
      ) : null}

      <EwcPicker value={line.ewc} onPick={(c) => set({ ewc: c })} onHazardous={onHazardous} error={e("ewc")} />

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 120px" }}>
          <Field label="Quantity" error={e("quantity")} htmlFor={`qty-${line.id}`}>
            <input id={`qty-${line.id}`} type="number" inputMode="decimal" min="0" step="any" value={line.quantity} onChange={(ev) => set({ quantity: ev.target.value })} />
          </Field>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Unit" error={e("unit")} htmlFor={`unit-${line.id}`}>
            <select id={`unit-${line.id}`} value={line.unit} onChange={(ev) => set({ unit: ev.target.value as WasteLine["unit"] })}>
              <option value="">Pick</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <Choices
        label="Loose or in a container?"
        two
        options={[
          { value: "loose", label: "Loose" },
          { value: "container", label: "In a container" },
        ]}
        value={line.packaging}
        onChange={(v) => set({ packaging: v })}
        error={e("packaging")}
      />
      {line.packaging === "container" ? (
        <>
          <Choices label="Container type" two options={CONTAINERS} value={line.containerType} onChange={(v) => set({ containerType: v })} error={e("containerType")} />
          {line.containerType === "other" ? (
            <Field label="What container?" error={e("containerOther")} htmlFor={`cont-${line.id}`}>
              <input id={`cont-${line.id}`} type="text" value={line.containerOther} onChange={(ev) => set({ containerOther: ev.target.value })} />
            </Field>
          ) : null}
        </>
      ) : null}

      <div className="label">Anything the next holder should know?</div>
      <div className="choices">
        <Check label="Needs a special container" checked={line.specialContainer} onChange={(v) => set({ specialContainer: v })} />
        <Check label="Cannot be mixed with other waste" checked={line.noMix} onChange={(v) => set({ noMix: v })} />
        <Check label="Dusty or smelly" checked={line.dustyOrSmelly} onChange={(v) => set({ dustyOrSmelly: v })} />
        <Check label="Risk of leakage" checked={line.leakRisk} onChange={(v) => set({ leakRisk: v })} />
      </div>
      <div style={{ height: 12 }} />
      <Field label="Other handling notes (optional)" htmlFor={`notes-${line.id}`}>
        <input id={`notes-${line.id}`} type="text" value={line.handlingNotes} onChange={(ev) => set({ handlingNotes: ev.target.value })} />
      </Field>
    </div>
  );
}

// ---------- the wizard ----------

type Stop = { reason: "answer" | "code"; code?: string; lineIndex?: number } | null;

export default function NoteWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const [app, setApp] = useState<AppData | null>(null);
  const [offline, setOffline] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [stop, setStop] = useState<Stop>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Draft | null>(null);

  const started = useRef(false);

  // Load app data and the draft. Once only, so a second run cannot start a second note.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const a = await loadAppData();
      if (a.signedOut) return router.replace("/login");
      setApp(a.data);
      setOffline(a.offline);
      const corrects = params.get("corrects");
      // Reloading the page resumes the note in progress. Only ?fresh=1 or a correction starts a new one.
      let d: Draft | null = params.get("fresh") || corrects ? null : await currentDraft();
      if (!d && corrects) {
        const r = await fetch(apiUrl(`/api/notes/${corrects}/source`)).catch(() => null);
        if (!r || !r.ok) {
          setLoadError(r ? (await r.json().catch(() => ({}))).error ?? "Could not load the note to correct." : "No signal. A correction needs signal to start.");
          return;
        }
        const src = await r.json();
        const base = emptyNote(uuid());
        const data: NoteData = {
          ...base,
          ...src.data,
          clientId: base.clientId,
          noteNo: null,
          emailConfirm: src.data.email ?? "",
          hierarchyConfirmed: false,
          customerSignName: "",
          operativeSignName: a.data?.operative.name ?? "",
          supersedesId: src.id,
          supersedesNo: src.noteNo,
        };
        d = { clientId: data.clientId, step: 1, data, photos: [], customerSig: null, operativeSig: null, updatedAt: "" };
      }
      if (!d) {
        const data = emptyNote(uuid());
        data.operativeSignName = a.data?.operative.name ?? "";
        if (a.data?.vehicles.length === 1) data.vehicle = a.data.vehicles[0];
        d = { clientId: data.clientId, step: 1, data, photos: [], customerSig: null, operativeSig: null, updatedAt: "" };
      }
      latest.current = d;
      setDraft(d);
      await saveDraft(d);
      if (params.toString()) router.replace("/new");
      if (!d.data.noteNo) reserve(d.clientId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reserve(clientId: string) {
    try {
      const r = await fetch(apiUrl("/api/notes/reserve"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!r.ok) return;
      const j = await r.json();
      update((d) => ({ ...d, data: { ...d.data, noteNo: j.noteNo } }));
    } catch {
      // Offline: the number is given when the note is sent.
    }
  }

  // Autosave to the phone after every change.
  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      latest.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveDraft(next), 200);
      return next;
    });
  }, []);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && latest.current && !sentId) saveDraft(latest.current);
    };
    const hide = () => latest.current && !sentId && saveDraft(latest.current);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", hide);
    };
  }, [sentId]);

  const setData = (p: Partial<NoteData>) => update((d) => ({ ...d, data: { ...d.data, ...p } }));
  const goto = (step: number) => {
    update((d) => ({ ...d, step }));
    window.scrollTo({ top: 0 });
  };

  const photoUrls = useMemo(() => (draft?.photos ?? []).map((b) => URL.createObjectURL(b)), [draft?.photos]);
  useEffect(() => () => photoUrls.forEach((u) => URL.revokeObjectURL(u)), [photoUrls]);

  if (loadError)
    return (
      <main className="wrap">
        <div className="notice danger">{loadError}</div>
        <Link className="btn block" href="/">
          Back
        </Link>
      </main>
    );
  if (sentId) return <SentScreen clientId={sentId} />;
  if (!draft || !app)
    return (
      <main className="wrap">
        <p>Loading</p>
      </main>
    );

  const d = draft.data;
  const step = draft.step;
  const errors = validateStep(step, d);
  const show = tried[step] ? errors : {};
  const vehicles = app.vehicles;

  function next() {
    if (Object.keys(errors).length) {
      setTried((t) => ({ ...t, [step]: true }));
      setTimeout(() => document.querySelector(".invalid, .err")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    goto(step + 1);
  }

  async function cancelNote() {
    if (!confirm("Cancel this note? Nothing will be sent.")) return;
    fetch(apiUrl("/api/notes/cancel"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: d.clientId, reason: stop ? `Hazardous waste (${stop.reason})` : "Cancelled on phone" }),
    }).catch(() => null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    latest.current = null;
    await dropDraft(d.clientId);
    router.replace("/");
  }

  async function submit(send: boolean) {
    const ua = navigator.userAgent;
    const item: OutboxItem = {
      clientId: d.clientId,
      noteNo: d.noteNo,
      customerName: d.customerName,
      email: d.email,
      send,
      payload: {
        data: d,
        customerSig: { ...draft!.customerSig!, userAgent: ua },
        operativeSig: { ...draft!.operativeSig!, userAgent: ua },
        send,
        photoCount: draft!.photos.length,
      },
      photos: draft!.photos,
      photosDone: [],
      status: "queued",
      queuedAt: new Date().toISOString(),
    };
    // Into the queue first, so a signed note is never lost, then try to send.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    latest.current = null;
    await enqueue(item);
    await dropDraft(d.clientId);
    setSentId(d.clientId);
    processOutbox();
  }

  // ---------- steps ----------

  let body: React.ReactNode = null;

  if (step === 1) {
    body = (
      <>
        <h1>Job</h1>
        {d.supersedesNo ? <div className="notice warn">This note corrects note {d.supersedesNo}. That note will be marked superseded.</div> : null}
        <div className="card surface">
          <div className="label">Note number</div>
          <div className="result-big" style={{ fontSize: 24 }}>{d.noteNo ?? "Given when sent"}</div>
          {!d.noteNo ? <div className="hint">No signal yet. The number is added when the note reaches the office.</div> : null}
        </div>
        <Field label="Date and time of transfer" error={show.transferAt} htmlFor="when">
          <input id="when" type="datetime-local" value={toLocalInput(d.transferAt)} onChange={(e) => setData({ transferAt: fromLocalInput(e.target.value) })} />
        </Field>
        <Field label="Operative" hint="From your login.">
          <input type="text" value={app.operative.name} readOnly />
        </Field>
        <Choices
          label="Vehicle"
          options={[...vehicles.map((v) => ({ value: v, label: v })), { value: "other", label: "Other vehicle" }]}
          value={d.vehicle}
          onChange={(v) => setData({ vehicle: v })}
          error={show.vehicle}
        />
        {d.vehicle === "other" ? (
          <Field label="Registration" error={show.vehicleOther} htmlFor="vreg">
            <input id="vreg" type="text" autoCapitalize="characters" value={d.vehicleOther} onChange={(e) => setData({ vehicleOther: e.target.value.toUpperCase() })} />
          </Field>
        ) : null}
      </>
    );
  }

  if (step === 2) {
    const pcOk = isValidPostcode(d.postcode);
    body = (
      <>
        <h1>Customer</h1>
        <p className="smallprint">Who is handing the waste over.</p>
        <Choices
          label="Customer type"
          options={CUSTOMER_TYPES}
          value={d.customerType}
          onChange={(v) =>
            setData({
              customerType: v,
              capacity: v === "householder" ? "householder" : d.capacity === "householder" ? "" : d.capacity,
              sic: v === "householder" ? "" : d.sic,
            })
          }
          error={show.customerType}
        />
        {d.customerType === "householder" ? <p className="smallprint">{HOUSEHOLDER_NOTE}</p> : null}
        <Field label="Name" error={show.customerName} htmlFor="cname">
          <input id="cname" type="text" autoCapitalize="words" autoComplete="off" value={d.customerName} onChange={(e) => setData({ customerName: e.target.value })} />
        </Field>
        {d.customerType === "business" || d.customerType === "agent" ? (
          <Field label="Company name" error={show.companyName} htmlFor="company">
            <input id="company" type="text" value={d.companyName} onChange={(e) => setData({ companyName: e.target.value })} />
          </Field>
        ) : null}
        <LocationButton
          onFound={(pc, area) =>
            setData({ postcode: pc, address: d.address.trim() ? d.address : area })
          }
        />
        <Field label="Address where the waste is collected" error={show.address} htmlFor="addr" hint="House number and street.">
          <textarea id="addr" style={{ minHeight: 72 }} value={d.address} onChange={(e) => setData({ address: e.target.value })} />
        </Field>
        <Field label="Postcode" error={show.postcode} htmlFor="pc">
          <input id="pc" type="text" autoCapitalize="characters" value={d.postcode} onChange={(e) => setData({ postcode: e.target.value.toUpperCase() })} onBlur={() => pcOk && setData({ postcode: normalisePostcode(d.postcode) })} />
        </Field>
        {pcOk && !isInServiceArea(d.postcode) ? <div className="notice warn">This postcode is outside the LS area. Offload stays inside the LS patch. Check before you load.</div> : null}

        <Check label="Customer has no email or will not give one" checked={d.noEmail} onChange={(v) => setData({ noEmail: v })} />
        <div style={{ height: 12 }} />
        {!d.noEmail ? (
          <>
            <Field label="Email (the note is sent here)" error={show.email} htmlFor="email" hint="Ask the customer to read it back to you.">
              <input id="email" className="email-big" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={d.email} onChange={(e) => setData({ email: e.target.value.trim() })} />
            </Field>
            <Field label="Type the email again" error={show.emailConfirm} htmlFor="email2">
              <input
                id="email2"
                className="email-big"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                value={d.emailConfirm}
                onPaste={(e) => e.preventDefault()}
                onChange={(e) => setData({ emailConfirm: e.target.value.trim() })}
              />
            </Field>
          </>
        ) : (
          <div className="notice warn">The note will be saved but not emailed. The office can send it later.</div>
        )}
        <Field label="Phone (optional)" htmlFor="phone">
          <input id="phone" type="tel" inputMode="tel" value={d.phone} onChange={(e) => setData({ phone: e.target.value })} />
        </Field>
        <Choices label="Capacity: the customer is the" options={CAPACITIES} value={d.capacity} onChange={(v) => setData({ capacity: v })} error={show.capacity} />
        {sicRequired(d.customerType) ? (
          <Field label="SIC code of the customer's business" error={show.sic} htmlFor="sic" hint="Five digits. Ask the customer, or look it up on Companies House.">
            <input id="sic" type="text" inputMode="numeric" maxLength={5} value={d.sic} onChange={(e) => setData({ sic: e.target.value.replace(/\D/g, "") })} />
          </Field>
        ) : d.customerType === "householder" ? (
          <Field label="SIC code">
            <input type="text" value={SIC_NOT_APPLICABLE} readOnly />
          </Field>
        ) : null}
      </>
    );
  }

  if (step === 3) {
    const setLine = (i: number, l: WasteLine) => setData({ lines: d.lines.map((x, j) => (j === i ? l : x)) });
    const hasPops = d.lines.some((l) => l.pops);
    body = (
      <>
        <h1>The waste</h1>
        <Choices
          label="Is any of this hazardous?"
          two
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
          value={d.hazardous}
          onChange={(v) => {
            setData({ hazardous: v });
            if (v === "yes") setStop({ reason: "answer" });
          }}
          error={show.hazardous}
        />
        <RefuseList />
        {hasPops && d.lines.length > 1 ? <div className="notice danger">{POPS_WARNING}</div> : null}
        {d.lines.map((l, i) => (
          <LineEditor
            key={l.id}
            line={l}
            index={i}
            errors={show}
            canRemove={d.lines.length > 1}
            onChange={(nl) => setLine(i, nl)}
            onRemove={() => setData({ lines: d.lines.filter((_, j) => j !== i) })}
            onHazardous={(code) => setStop({ reason: "code", code, lineIndex: i })}
          />
        ))}
        {show.lines ? <div className="err">{show.lines}</div> : null}
        <button
          type="button"
          className="btn block secondary"
          onClick={() => {
            const bad = d.lines.findIndex((l) => Object.keys(validateLine(l)).length > 0);
            if (bad >= 0) {
              setTried((t) => ({ ...t, 3: true }));
              document.querySelector(`[data-line="${bad}"]`)?.scrollIntoView({ behavior: "smooth" });
              return;
            }
            setData({ lines: [...d.lines, newLine()] });
          }}
        >
          Add waste
        </button>
      </>
    );
  }

  if (step === 4) {
    body = (
      <>
        <h1>Waste hierarchy</h1>
        <p>Hand the phone to the customer. They tick this.</p>
        <label className={`choice ${d.hierarchyConfirmed ? "on" : ""} ${show.hierarchyConfirmed ? "invalid" : ""}`} style={{ alignItems: "flex-start", padding: 16 }}>
          <input type="checkbox" checked={d.hierarchyConfirmed} onChange={(e) => setData({ hierarchyConfirmed: e.target.checked })} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 18 }}>{HIERARCHY_STATEMENT}</span>
        </label>
        {show.hierarchyConfirmed ? <div className="err">{show.hierarchyConfirmed}</div> : null}
        <p className="smallprint" style={{ marginTop: 12 }}>
          The waste hierarchy means preventing waste first, then reuse, recycling and recovery, with disposal last.
        </p>
      </>
    );
  }

  if (step === 5) {
    body = (
      <>
        <h1>Offload details</h1>
        <p className="smallprint">Who is receiving the waste. Filled in for you and locked.</p>
        {app.carrierRegMissing ? <div className="notice danger">The carrier registration number is not set. This note cannot be sent until the office adds it.</div> : null}
        <div className="card locked">
          <dl className="kv">
            <dt>Name</dt>
            <dd>{BUSINESS.TRADING_NAME}</dd>
            <dt>Address</dt>
            <dd>{[...BUSINESS.ADDRESS_LINES, BUSINESS.POSTCODE].join(", ")}</dd>
            <dt>Capacity</dt>
            <dd>{BUSINESS.CAPACITY}</dd>
            <dt>Registration</dt>
            <dd>{CARRIER_REG_NO || "Not set"}</dd>
          </dl>
        </div>
      </>
    );
  }

  if (step === 6) {
    body = (
      <>
        <h1>Destination</h1>
        <p className="smallprint">Where the waste is going. Only sites the office has checked on the Environment Agency register are listed.</p>
        <div className="choices">
          {app.sites.map((s) => (
            <label key={s.id} className={`choice ${d.destinationSiteId === s.id ? "on" : ""}`}>
              <input type="radio" checked={d.destinationSiteId === s.id} onChange={() => setData({ destinationSiteId: s.id })} />
              <span>
                <strong>{s.name}</strong>
                <small>{s.address}</small>
                <small>Permit {s.permit_no}</small>
                <small>{s.last_checked ? `Checked on ${formatDate(s.last_checked)}` : "Not checked yet"}</small>
              </span>
            </label>
          ))}
          <label className={`choice ${d.destinationSiteId === null ? "on" : ""}`}>
            <input type="radio" checked={d.destinationSiteId === null} onChange={() => setData({ destinationSiteId: null })} />
            <span>
              Not known yet
              <small>The office adds it later. The note shows &quot;to be confirmed&quot; until then.</small>
            </span>
          </label>
        </div>
        <p className="smallprint" style={{ marginTop: 12 }}>
          Site not listed? Pick &quot;Not known yet&quot;. {app.operative.role === "admin" ? <Link href="/admin/sites">Add a site</Link> : "The office will add it."}
        </p>
      </>
    );
  }

  if (step === 7) {
    body = (
      <>
        <h1>Photos</h1>
        <p className="smallprint">Recommended. Up to {MAX_PHOTOS} photos of the waste as loaded. Photos are kept by Offload, not emailed.</p>
        <div className="photos">
          {photoUrls.map((u, i) => (
            <figure key={u}>
              <img src={u} alt={`Photo ${i + 1}`} />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => update((x) => ({ ...x, photos: x.photos.filter((_, j) => j !== i) }))}>
                X
              </button>
            </figure>
          ))}
        </div>
        {draft.photos.length < MAX_PHOTOS ? (
          <label className="btn block secondary" style={{ marginTop: 12 }}>
            Take photo
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const b = await compressPhoto(f);
                update((x) => (x.photos.length >= MAX_PHOTOS ? x : { ...x, photos: [...x.photos, b] }));
              }}
            />
          </label>
        ) : null}
      </>
    );
  }

  if (step === 8) {
    const sendErrors = validateForSubmit(d, true);
    const saveErrors = validateForSubmit(d, false);
    const sigsDone = !!draft.customerSig && !!draft.operativeSig;
    const blockers = () => {
      const out: { step: number; msg: string }[] = [];
      for (const s of [1, 2, 3, 4, 8]) {
        const first = Object.values(validateStep(s, d))[0];
        if (first) out.push({ step: s, msg: first });
      }
      return out;
    };
    const canSend = !d.noEmail && Object.keys(sendErrors).length === 0 && sigsDone && !app.carrierRegMissing;
    const canSave = Object.keys(saveErrors).length === 0 && sigsDone && !app.carrierRegMissing;
    const site = app.sites.find((s) => s.id === d.destinationSiteId);
    body = (
      <>
        <h1>Sign and send</h1>
        <div className="card surface">
          <h3>What you are signing</h3>
          <p>
            <strong>{d.customerName}</strong>
            {d.companyName ? ` of ${d.companyName}` : ""} is handing this waste to {BUSINESS.TRADING_NAME}, a {BUSINESS.CAPACITY.toLowerCase()} (registration {CARRIER_REG_NO || "not set"}).
          </p>
          <ul>
            {d.lines.map((l) => (
              <li key={l.id}>
                {l.description || "No description"}: {quantityText(l)}, {containerText(l).toLowerCase()}, code {formatEwc(l.ewc)}.
                {handlingText(l) !== "None" ? ` ${handlingText(l)}.` : ""}
              </li>
            ))}
          </ul>
          <p>
            Collected from {d.address}, {d.postcode} on {formatDateTime(d.transferAt)}.
          </p>
          <p>Going to: {site ? `${site.name}, permit ${site.permit_no}` : "a permitted site, confirmed by Offload later"}.</p>
          <p>None of it is hazardous. {d.hierarchyConfirmed ? "You have confirmed the waste hierarchy statement." : ""}</p>
          {!d.noEmail ? (
            <p>
              The note will be emailed to <strong style={{ fontSize: 19 }}>{d.email}</strong>
            </p>
          ) : (
            <p>No email given. The note will be saved, not emailed.</p>
          )}
        </div>

        <Field label="Customer name" error={show.customerSignName} htmlFor="csn">
          <input id="csn" type="text" autoCapitalize="words" value={d.customerSignName} onChange={(e) => setData({ customerSignName: e.target.value })} />
        </Field>
        <SignaturePad label="Customer signature" value={draft.customerSig} onChange={(v) => update((x) => ({ ...x, customerSig: v }))} />

        <Field label="Operative name" error={show.operativeSignName} htmlFor="osn">
          <input id="osn" type="text" autoCapitalize="words" value={d.operativeSignName} onChange={(e) => setData({ operativeSignName: e.target.value })} />
        </Field>
        <SignaturePad label="Operative signature" value={draft.operativeSig} onChange={(v) => update((x) => ({ ...x, operativeSig: v }))} />

        {app.carrierRegMissing ? <div className="notice danger">The carrier registration number is not set. Notes cannot be sent until the office adds it.</div> : null}
        {!(d.noEmail ? canSave : canSend) ? (
          <div className="notice warn">
            <strong>Still needed before sending:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {blockers().map((b) => (
                <li key={b.step}>
                  <button type="button" className="linkbtn" style={{ minHeight: 0, padding: 0 }} onClick={() => goto(b.step)}>
                    Step {b.step}: {b.msg}
                  </button>
                </li>
              ))}
              {!draft.customerSig ? <li>Customer signature</li> : null}
              {!draft.operativeSig ? <li>Operative signature</li> : null}
            </ul>
          </div>
        ) : null}

        {!d.noEmail ? (
          <button type="button" className="btn block big" disabled={!canSend} onClick={() => submit(true)}>
            Send note
          </button>
        ) : null}
        <div style={{ height: 12 }} />
        <button
          type="button"
          className={`btn block ${d.noEmail ? "big" : "secondary"}`}
          disabled={!canSave}
          onClick={() => {
            if (d.noEmail || confirm("Save without emailing the customer? The office can send it later.")) submit(false);
          }}
        >
          Save without sending
        </button>
      </>
    );
  }

  return (
    <>
      <div className="progress">
        <div className="meta">
          <span>
            Step <b>{step}</b> of 8 · {TITLES[step - 1]}
          </span>
          <span>
            {d.noteNo ?? "No number yet"}
            {offline ? " · offline" : ""}
          </span>
        </div>
        <div className="steps" aria-hidden>
          {TITLES.map((_, i) => (
            <span key={i} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""} />
          ))}
        </div>
      </div>
      <main className="wrap">
        {body}
        <p style={{ marginTop: 24 }}>
          <button type="button" className="linkbtn" onClick={cancelNote}>
            Cancel this note
          </button>
        </p>
      </main>
      {step < 8 ? (
        <nav className="bottombar">
          <button type="button" className="btn secondary" onClick={() => (step === 1 ? router.push("/") : goto(step - 1))}>
            Back
          </button>
          <button type="button" className="btn" onClick={next} disabled={step === 3 && d.hazardous === "yes"}>
            {step === 6 && !d.destinationSiteId ? "Skip for now" : "Next"}
          </button>
        </nav>
      ) : (
        <nav className="bottombar">
          <button type="button" className="btn secondary" onClick={() => goto(7)}>
            Back
          </button>
        </nav>
      )}
      {stop ? (
        <div className="stop" role="alertdialog" aria-modal="true" aria-labelledby="stop-title">
          <div className="inner">
            <h1 id="stop-title">Stop. Do not load it.</h1>
            <p style={{ fontSize: 20, fontWeight: 700 }}>
              Hazardous waste needs a hazardous waste consignment note, not a transfer note. Do not load it.
            </p>
            {stop.code ? <p>Code {formatEwc(stop.code.replace("*", ""))}* is hazardous. It has not been added.</p> : null}
            <div className="card">
              <div className="label">We do not take</div>
              <ul>
                {REFUSED_ITEMS.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <button type="button" className="btn danger block big" onClick={cancelNote}>
              Cancel the note
            </button>
            <div style={{ height: 12 }} />
            <button
              type="button"
              className="btn secondary block"
              onClick={() => {
                if (stop.reason === "answer") setData({ hazardous: "" });
                setStop(null);
              }}
            >
              {stop.reason === "answer" ? "I tapped Yes by mistake" : "Pick a different code"}
            </button>
            <p className="smallprint" style={{ marginTop: 12 }}>
              If only part of the load is hazardous, leave that part behind and tell the customer to use a licensed hazardous waste carrier.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------- after Send ----------

function SentScreen({ clientId }: { clientId: string }) {
  const [item, setItem] = useState<OutboxItem | null>(null);
  useEffect(() => {
    const refresh = async () => setItem((await outbox()).find((i) => i.clientId === clientId) ?? null);
    refresh();
    const off = onOutboxChange(refresh);
    const online = () => processOutbox();
    window.addEventListener("online", online);
    const t = setInterval(() => processOutbox(), 15_000);
    return () => {
      off();
      window.removeEventListener("online", online);
      clearInterval(t);
    };
  }, [clientId]);

  if (!item) return <main className="wrap"><p>Saving</p></main>;
  const done = item.status === "signed";
  return (
    <main className="wrap" style={{ paddingTop: 32 }}>
      <h1>{done ? (item.emailStatus === "sent" ? "Sent" : "Saved") : "Not sent yet"}</h1>
      <div className="label">Note number</div>
      <div className="result-big">{item.noteNo ?? "Given when sent"}</div>
      {done && item.emailStatus === "sent" ? <p style={{ fontSize: 20 }}>Sent to <strong>{item.email}</strong></p> : null}
      <OutboxStatus item={item} />
      {item.status === "queued" ? (
        <button className="btn block" onClick={() => processOutbox()}>
          Try now
        </button>
      ) : null}
      <div style={{ height: 12 }} />
      <Link className="btn block big secondary" href="/">
        Done
      </Link>
    </main>
  );
}

function LocationButton({ onFound }: { onFound: (postcode: string, area: string) => void }) {
  const [state, setState] = useState<"" | "busy" | "error">("");
  return (
    <div className="field">
      <button
        type="button"
        className="btn small secondary"
        disabled={state === "busy"}
        onClick={() => {
          if (!navigator.geolocation) return setState("error");
          setState("busy");
          navigator.geolocation.getCurrentPosition(
            async (p) => {
              try {
                const r = await fetch(`https://api.postcodes.io/postcodes?lon=${p.coords.longitude}&lat=${p.coords.latitude}&limit=1`);
                const j = await r.json();
                const hit = j.result?.[0];
                if (!hit) throw new Error("none");
                onFound(hit.postcode, [hit.admin_ward, hit.admin_district].filter(Boolean).join(", "));
                setState("");
              } catch {
                setState("error");
              }
            },
            () => setState("error"),
            { enableHighAccuracy: true, timeout: 15_000 },
          );
        }}
      >
        {state === "busy" ? "Finding you" : "Use my location"}
      </button>
      {state === "error" ? <div className="hint">Could not find the location. Type the address.</div> : <div className="hint">Fills the postcode. Check it and add the street.</div>}
    </div>
  );
}
