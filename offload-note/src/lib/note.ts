// The waste transfer note: shape, rules and plain-language labels.
// Shared by the phone form and the server so both block the same things.

import { findEwc, isHazardousCode, isValidEwcFormat } from "./ewc";
import { SERVICE_AREA_PREFIX } from "@/config/offload";

export type CustomerType = "householder" | "business" | "agent";
export type Capacity = "producer" | "householder" | "agent";
export type Unit = "items" | "bags" | "m3" | "van" | "kg";
export type Packaging = "loose" | "container";
export type ContainerType = "bags" | "skip" | "wheelie_bin" | "ibc" | "loose_in_van" | "other";

export type WasteLine = {
  id: string;
  description: string;
  ewc: string; // six digits, no spaces
  quantity: string;
  unit: Unit | "";
  packaging: Packaging | "";
  containerType: ContainerType | "";
  containerOther: string;
  specialContainer: boolean;
  noMix: boolean;
  dustyOrSmelly: boolean;
  leakRisk: boolean;
  handlingNotes: string;
  pops: boolean;
};

export type NoteData = {
  clientId: string;
  noteNo: string | null;
  transferAt: string; // ISO timestamp
  vehicle: string;
  vehicleOther: string;
  customerType: CustomerType | "";
  customerName: string;
  companyName: string;
  address: string;
  postcode: string;
  email: string;
  emailConfirm: string;
  noEmail: boolean; // customer has no email or will not give one
  phone: string;
  capacity: Capacity | "";
  sic: string;
  hazardous: "no" | "yes" | "";
  lines: WasteLine[];
  hierarchyConfirmed: boolean;
  destinationSiteId: number | null;
  customerSignName: string;
  operativeSignName: string;
  supersedesId: string | null;
  supersedesNo: string | null;
};

export const CUSTOMER_TYPES: { value: CustomerType; label: string }[] = [
  { value: "householder", label: "Householder" },
  { value: "business", label: "Business" },
  { value: "agent", label: "Landlord or agent" },
];

export const CAPACITIES: { value: Capacity; label: string }[] = [
  { value: "producer", label: "Producer of the waste" },
  { value: "householder", label: "Householder" },
  { value: "agent", label: "Agent for the producer" },
];

export const UNITS: { value: Unit; label: string }[] = [
  { value: "items", label: "items" },
  { value: "bags", label: "bags" },
  { value: "m3", label: "cubic metres" },
  { value: "van", label: "van fraction" },
  { value: "kg", label: "kg" },
];

export const CONTAINERS: { value: ContainerType; label: string }[] = [
  { value: "bags", label: "Bags" },
  { value: "skip", label: "Skip" },
  { value: "wheelie_bin", label: "Wheelie bin" },
  { value: "ibc", label: "IBC" },
  { value: "loose_in_van", label: "Loose in van" },
  { value: "other", label: "Other" },
];

export const SIC_NOT_APPLICABLE = "Not applicable (household waste)";

// ---------- POPs: upholstered domestic seating ----------

export const POPS_EWC = "200307";
export const POPS_DESCRIPTION = "Waste upholstered domestic seating containing POPs";
export const POPS_CHEMICALS =
  "Likely to contain: DecaBDE and other brominated flame retardants, antimony trioxide, chlorinated paraffins (short and medium chain) and hazardous components of PVC.";
export const POPS_WARNING =
  "Keep this separate from other waste. If it is mixed with other waste, the whole load is treated as POPs waste.";

// Words that always mean upholstered domestic seating.
const POPS_STRONG =
  /\b(sofas?|settees?|couch(es)?|armchairs?|arm chairs?|recliners?|chaise|chaises|futons?|bean ?bags?|sofa ?beds?|chesterfields?|love ?seats?|footstools?|pouffes?|poufs?|ottomans?)\b/i;
// Words that are seating only if upholstered, so we ask.
const POPS_MAYBE = /\b(chairs?|stools?|cushions?|seats?|seating)\b/i;
// Never seating on their own. "sofa bed" is caught by the strong list first.
const POPS_EXCLUDE = /\b(mattress(es)?|curtains?|blinds?|beds?|headboards?|divans?|carpets?|rugs?)\b/i;

export type PopsMatch = "yes" | "maybe" | "no";

/** Does this description look like upholstered domestic seating? */
export function detectPops(description: string): PopsMatch {
  const d = description.toLowerCase();
  if (POPS_STRONG.test(d)) return "yes";
  if (POPS_MAYBE.test(d)) return "maybe";
  // Excluded items (mattress, bed, curtains, blinds) never trigger.
  if (POPS_EXCLUDE.test(d)) return "no";
  return "no";
}

/** The full written description as it appears on the note. */
export function fullDescription(line: WasteLine): string {
  const d = line.description.trim();
  if (!line.pops) return d;
  return `${d}. ${POPS_CHEMICALS}`;
}

// ---------- vague descriptions ----------

const VAGUE_PHRASES = [
  "general waste", "general rubbish", "rubbish", "builders waste", "builder's waste", "builders' waste",
  "building waste", "junk", "waste", "mixed waste", "mixed rubbish", "household waste", "household rubbish",
  "stuff", "misc", "miscellaneous", "various", "various items", "bits", "odds and ends", "clearance",
  "trade waste", "skip waste", "garbage", "trash", "general", "mixed", "items", "things", "debris", "refuse",
];
const FILLER = new Set([
  "a", "an", "the", "and", "or", "of", "some", "lot", "lots", "load", "loads", "bag", "bags", "misc", "general",
  "mixed", "various", "assorted", "other", "etc", "from", "with", "stuff", "old", "few",
]);

/** Returns an error message if the description is too vague to be a legal description. */
export function vagueDescriptionError(description: string): string | null {
  const msg = "Say what it is, for example: mixed household clearance of furniture, cardboard and bags.";
  let d = description.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  if (d.length < 8) return msg;
  if (VAGUE_PHRASES.includes(d)) return msg;
  const sorted = [...VAGUE_PHRASES].sort((a, b) => b.length - a.length);
  for (const p of sorted) d = d.replace(new RegExp(`\\b${p.replace(/'/g, "'?")}\\b`, "g"), " ");
  const words = d.split(" ").filter((w) => w.length > 1 && !FILLER.has(w) && !/^\d+$/.test(w));
  return words.length >= 2 ? null : msg;
}

// ---------- field rules ----------

export function normalisePostcode(pc: string): string {
  const s = pc.toUpperCase().replace(/\s+/g, "");
  if (s.length < 5) return pc.toUpperCase().trim();
  return `${s.slice(0, -3)} ${s.slice(-3)}`;
}

export function isValidPostcode(pc: string): boolean {
  return /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?)|[0-9][A-HJKPS-UW]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i.test(
    pc.trim(),
  );
}

export function isInServiceArea(pc: string): boolean {
  const re = new RegExp(`^${SERVICE_AREA_PREFIX}\\d`, "i");
  return re.test(pc.trim());
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

export function isValidSic(s: string): boolean {
  return /^\d{5}$/.test(s.trim());
}

export function sicRequired(t: CustomerType | ""): boolean {
  return t === "business" || t === "agent";
}

export function newLine(): WasteLine {
  return {
    id: Math.random().toString(36).slice(2, 10),
    description: "",
    ewc: "",
    quantity: "",
    unit: "",
    packaging: "",
    containerType: "",
    containerOther: "",
    specialContainer: false,
    noMix: false,
    dustyOrSmelly: false,
    leakRisk: false,
    handlingNotes: "",
    pops: false,
  };
}

export function emptyNote(clientId: string): NoteData {
  return {
    clientId,
    noteNo: null,
    transferAt: new Date().toISOString(),
    vehicle: "",
    vehicleOther: "",
    customerType: "",
    customerName: "",
    companyName: "",
    address: "",
    postcode: "",
    email: "",
    emailConfirm: "",
    noEmail: false,
    phone: "",
    capacity: "",
    sic: "",
    hazardous: "",
    lines: [newLine()],
    hierarchyConfirmed: false,
    destinationSiteId: null,
    customerSignName: "",
    operativeSignName: "",
    supersedesId: null,
    supersedesNo: null,
  };
}

export type Errors = Record<string, string>;

export function validateLine(l: WasteLine): Errors {
  const e: Errors = {};
  const vague = vagueDescriptionError(l.description);
  if (!l.description.trim()) e.description = "Describe the waste.";
  else if (vague) e.description = vague;
  if (l.pops && !/pops/i.test(l.description)) e.description = `Keep "containing POPs" in the description.`;
  if (!l.ewc) e.ewc = "Pick an EWC code.";
  else if (l.pops && l.ewc !== POPS_EWC) e.ewc = "Upholstered domestic seating must be coded 20 03 07.";
  else if (isHazardousCode(l.ewc)) e.ewc = "Hazardous code. This cannot go on a transfer note.";
  else if (!isValidEwcFormat(l.ewc)) e.ewc = "EWC codes are six digits.";
  const q = Number(l.quantity);
  if (!l.quantity || !Number.isFinite(q) || q <= 0) e.quantity = "Enter a quantity.";
  if (!l.unit) e.unit = "Pick a unit.";
  if (!l.packaging) e.packaging = "Loose or in a container?";
  if (l.packaging === "container") {
    if (!l.containerType) e.containerType = "Pick the container type.";
    if (l.containerType === "other" && !l.containerOther.trim()) e.containerOther = "Say what the container is.";
  }
  return e;
}

/** Errors for one step of the form. Steps are 1 to 8. */
export function validateStep(step: number, n: NoteData, opts: { requireDestination?: boolean } = {}): Errors {
  const e: Errors = {};
  switch (step) {
    case 1: {
      if (!n.transferAt || Number.isNaN(Date.parse(n.transferAt))) e.transferAt = "Set the date and time.";
      if (!n.vehicle) e.vehicle = "Pick the vehicle.";
      if (n.vehicle === "other" && !n.vehicleOther.trim()) e.vehicleOther = "Enter the registration.";
      break;
    }
    case 2: {
      if (!n.customerType) e.customerType = "Pick the customer type.";
      if (!n.customerName.trim()) e.customerName = "Enter the name.";
      if ((n.customerType === "business" || n.customerType === "agent") && !n.companyName.trim())
        e.companyName = "Enter the company name.";
      if (!n.address.trim()) e.address = "Enter the address.";
      if (!n.postcode.trim()) e.postcode = "Enter the postcode.";
      else if (!isValidPostcode(n.postcode)) e.postcode = "That is not a valid UK postcode.";
      if (!n.noEmail) {
        if (!n.email.trim()) e.email = "Enter the email.";
        else if (!isValidEmail(n.email)) e.email = "That email does not look right.";
        if (n.email.trim() && n.email.trim().toLowerCase() !== n.emailConfirm.trim().toLowerCase())
          e.emailConfirm = "The two emails do not match.";
      }
      if (!n.capacity) e.capacity = "Pick the capacity.";
      if (sicRequired(n.customerType)) {
        if (!n.sic.trim()) e.sic = "Enter the SIC code.";
        else if (!isValidSic(n.sic)) e.sic = "SIC codes are five digits.";
      }
      break;
    }
    case 3: {
      if (!n.hazardous) e.hazardous = "Answer the hazardous question.";
      if (n.hazardous === "yes") e.hazardous = "Hazardous waste cannot go on a transfer note.";
      if (n.lines.length === 0) e.lines = "Add at least one waste line.";
      n.lines.forEach((l, i) => {
        const le = validateLine(l);
        for (const [k, v] of Object.entries(le)) e[`lines.${i}.${k}`] = v;
      });
      break;
    }
    case 4: {
      if (!n.hierarchyConfirmed) e.hierarchyConfirmed = "The customer must tick this.";
      break;
    }
    case 5:
      break;
    case 6: {
      if (opts.requireDestination && !n.destinationSiteId) e.destinationSiteId = "Pick the destination.";
      break;
    }
    case 7:
      break;
    case 8: {
      if (!n.customerSignName.trim()) e.customerSignName = "Customer name needed.";
      if (!n.operativeSignName.trim()) e.operativeSignName = "Operative name needed.";
      break;
    }
  }
  return e;
}

/** All errors that block saving a signed note. Email rules relax for "save without sending". */
export function validateForSubmit(n: NoteData, send: boolean): Errors {
  const e: Errors = {};
  for (const s of [1, 2, 3, 4, 5, 6, 8]) Object.assign(e, validateStep(s, n));
  if (send && n.noEmail) e.email = "No email given. Use Save without sending.";
  return e;
}

export function isHouseholder(n: Pick<NoteData, "customerType">): boolean {
  return n.customerType === "householder";
}

export function sicDisplay(n: Pick<NoteData, "customerType" | "sic">): string {
  return isHouseholder(n) ? SIC_NOT_APPLICABLE : n.sic.trim();
}

export function labelOf<T extends string>(list: { value: T; label: string }[], v: string): string {
  return list.find((x) => x.value === v)?.label ?? v;
}

export function quantityText(l: WasteLine): string {
  const one = Number(l.quantity) === 1;
  const singular: Record<string, string> = { items: "item", bags: "bag", m3: "cubic metre" };
  return `${l.quantity} ${one && singular[l.unit] ? singular[l.unit] : labelOf(UNITS, l.unit)}`;
}

export function containerText(l: WasteLine): string {
  if (l.packaging === "loose") return "Loose";
  const c = l.containerType === "other" ? l.containerOther.trim() : labelOf(CONTAINERS, l.containerType);
  return `In a container: ${c}`;
}

export function handlingText(l: WasteLine): string {
  const bits: string[] = [];
  if (l.specialContainer) bits.push("Needs a special container");
  if (l.noMix) bits.push("Do not mix with other waste");
  if (l.dustyOrSmelly) bits.push("Dusty or smelly");
  if (l.leakRisk) bits.push("Risk of leakage");
  if (l.pops) bits.push("POPs: keep separate");
  if (l.handlingNotes.trim()) bits.push(l.handlingNotes.trim());
  return bits.join(". ") || "None";
}

export { findEwc };
