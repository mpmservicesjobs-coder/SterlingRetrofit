// Offload Waste Removal: business facts for the waste transfer note app.
// This is the one place these facts live. Every screen, the PDF and the
// email read from here. Confirmed 26 September 2026 (brief section 2).

export const BUSINESS = {
  // Sole trader. Not a limited company, not under any group name.
  // Never add the owner's personal name here or anywhere on the note.
  TRADING_NAME: "Offload Waste Removal",
  // Facility address. It is NOT a registered office, so never label it one.
  ADDRESS_LINES: ["Springfield Mills", "Bagley Lane", "Leeds"],
  POSTCODE: "LS28 5LY",
  PHONE: "07777 365390", // mobile and WhatsApp, no landline
  EMAIL: "info@offloadwaste.com",
  HOURS: "Monday to Saturday, 9am to 5pm",
  CARRIER_TIER: "Upper tier",
  CAPACITY: "Registered upper tier waste carrier",
} as const;

// Waste carrier registration (CBDU) number. TBC with the owner.
// While this is empty the app refuses to send or save any note.
export const CARRIER_REG_NO = "";

// SIC 38110: collection of non-hazardous waste. Confirm with the owner.
export const OFFLOAD_SIC = "38110";

// Not VAT registered: no VAT line is printed anywhere.
export const VAT_REGISTERED = false;

// Email sending.
export const EMAIL_FROM = `${BUSINESS.TRADING_NAME} <notes@offloadwaste.com>`;
export const EMAIL_REPLY_TO = BUSINESS.EMAIL;
export const EMAIL_BCC = BUSINESS.EMAIL;

// Vans. Seeded into the database on first run; the owner can then manage
// them from the admin screen. Add real registrations here before launch.
export const VEHICLES: string[] = [];

// Offload stays inside the LS patch. Postcodes outside it get a warning.
export const SERVICE_AREA_PREFIX = "LS";

// Things Offload does not take (operating policy refuse list).
export const REFUSED_ITEMS = [
  "Asbestos, or anything that might contain it",
  "Gas bottles and cylinders",
  "Chemicals, solvents, pesticides, oils and paint containing dangerous substances",
  "Clinical waste, needles and medicines",
];

// Retention. Notes are never deleted inside this window.
export const RETENTION_YEARS = 2;

// Limits.
export const MAX_PHOTOS = 6;
export const SENDS_PER_OPERATIVE_PER_HOUR = 30;
export const LOGIN_FAILS_BEFORE_LOCK = 5;
export const LOGIN_LOCK_MINUTES = 15;
export const SESSION_DAYS = 30;

// Legal wording. Keep exactly as written.
export const HIERARCHY_STATEMENT =
  "I confirm that I have applied the waste hierarchy as required by regulation 12 of the Waste (England and Wales) Regulations 2011.";
export const DUTY_OF_CARE_LINE =
  "Duty of care, Environmental Protection Act 1990 section 34.";
export const KEEP_LINE = "Keep this note for at least 2 years.";
export const HOUSEHOLDER_NOTE =
  "A householder handing over their own household waste does not have to complete a transfer note. Offload issues one anyway for its own records and for the receiving site.";

export const TIMEZONE = "Europe/London";

export function carrierRegMissing(): boolean {
  return CARRIER_REG_NO.trim() === "";
}
