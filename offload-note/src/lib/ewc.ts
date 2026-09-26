// List of Wastes (EWC) codes used by the picker.
// Descriptions follow the List of Wastes (England) Regulations 2005 as set
// out in Environment Agency guidance WM3, Appendix A. Check every entry
// against the current WM3 before shipping. Entries with hazardous: true carry
// an asterisk in the list and can never go on a waste transfer note.

export type EwcCode = {
  code: string; // six digits, no spaces
  description: string;
  hazardous: boolean;
  common?: string; // plain words shown for the common picker entries
};

export const COMMON_EWC: EwcCode[] = [
  { code: "200301", description: "Mixed municipal waste", hazardous: false, common: "Mixed household or commercial clearance" },
  { code: "200307", description: "Bulky waste", hazardous: false, common: "Bulky waste. Also upholstered domestic seating (POPs)" },
  { code: "170904", description: "Mixed construction and demolition wastes other than those mentioned in 17 09 01, 17 09 02 and 17 09 03", hazardous: false, common: "Mixed construction and demolition waste" },
  { code: "200201", description: "Biodegradable waste", hazardous: false, common: "Garden and park waste" },
  { code: "200138", description: "Wood other than that mentioned in 20 01 37", hazardous: false, common: "Wood (not treated with hazardous substances)" },
  { code: "200140", description: "Metals", hazardous: false, common: "Metals" },
  { code: "200136", description: "Discarded electrical and electronic equipment other than those mentioned in 20 01 21, 20 01 23 and 20 01 35", hazardous: false, common: "Electricals (non-hazardous)" },
];

const MORE_EWC: EwcCode[] = [
  // 15 01 packaging
  { code: "150101", description: "Paper and cardboard packaging", hazardous: false },
  { code: "150102", description: "Plastic packaging", hazardous: false },
  { code: "150103", description: "Wooden packaging", hazardous: false },
  { code: "150104", description: "Metallic packaging", hazardous: false },
  { code: "150106", description: "Mixed packaging", hazardous: false },
  { code: "150107", description: "Glass packaging", hazardous: false },
  { code: "150110", description: "Packaging containing residues of or contaminated by hazardous substances", hazardous: true },
  { code: "150111", description: "Metallic packaging containing a hazardous solid porous matrix (for example asbestos), including empty pressure containers", hazardous: true },
  // 16
  { code: "160103", description: "End-of-life tyres", hazardous: false },
  { code: "160504", description: "Gases in pressure containers (including halons) containing hazardous substances", hazardous: true },
  { code: "160505", description: "Gases in pressure containers other than those mentioned in 16 05 04", hazardous: false },
  { code: "160601", description: "Lead batteries", hazardous: true },
  // 17 construction and demolition
  { code: "170101", description: "Concrete", hazardous: false },
  { code: "170102", description: "Bricks", hazardous: false },
  { code: "170103", description: "Tiles and ceramics", hazardous: false },
  { code: "170107", description: "Mixtures of concrete, bricks, tiles and ceramics other than those mentioned in 17 01 06", hazardous: false },
  { code: "170201", description: "Wood", hazardous: false },
  { code: "170202", description: "Glass", hazardous: false },
  { code: "170203", description: "Plastic", hazardous: false },
  { code: "170204", description: "Glass, plastic and wood containing or contaminated with hazardous substances", hazardous: true },
  { code: "170302", description: "Bituminous mixtures other than those mentioned in 17 03 01", hazardous: false },
  { code: "170301", description: "Bituminous mixtures containing coal tar", hazardous: true },
  { code: "170401", description: "Copper, bronze, brass", hazardous: false },
  { code: "170402", description: "Aluminium", hazardous: false },
  { code: "170405", description: "Iron and steel", hazardous: false },
  { code: "170407", description: "Mixed metals", hazardous: false },
  { code: "170411", description: "Cables other than those mentioned in 17 04 10", hazardous: false },
  { code: "170503", description: "Soil and stones containing hazardous substances", hazardous: true },
  { code: "170504", description: "Soil and stones other than those mentioned in 17 05 03", hazardous: false },
  { code: "170601", description: "Insulation materials containing asbestos", hazardous: true },
  { code: "170604", description: "Insulation materials other than those mentioned in 17 06 01 and 17 06 03", hazardous: false },
  { code: "170605", description: "Construction materials containing asbestos", hazardous: true },
  { code: "170802", description: "Gypsum-based construction materials other than those mentioned in 17 08 01", hazardous: false },
  { code: "170903", description: "Other construction and demolition wastes (including mixed wastes) containing hazardous substances", hazardous: true },
  // 20 municipal
  { code: "200101", description: "Paper and cardboard", hazardous: false },
  { code: "200102", description: "Glass", hazardous: false },
  { code: "200108", description: "Biodegradable kitchen and canteen waste", hazardous: false },
  { code: "200110", description: "Clothes", hazardous: false },
  { code: "200111", description: "Textiles", hazardous: false },
  { code: "200113", description: "Solvents", hazardous: true },
  { code: "200119", description: "Pesticides", hazardous: true },
  { code: "200121", description: "Fluorescent tubes and other mercury-containing waste", hazardous: true },
  { code: "200123", description: "Discarded equipment containing chlorofluorocarbons", hazardous: true },
  { code: "200125", description: "Edible oil and fat", hazardous: false },
  { code: "200126", description: "Oil and fat other than those mentioned in 20 01 25", hazardous: true },
  { code: "200127", description: "Paint, inks, adhesives and resins containing hazardous substances", hazardous: true },
  { code: "200128", description: "Paint, inks, adhesives and resins other than those mentioned in 20 01 27", hazardous: false },
  { code: "200131", description: "Cytotoxic and cytostatic medicines", hazardous: true },
  { code: "200132", description: "Medicines other than those mentioned in 20 01 31", hazardous: false },
  { code: "200133", description: "Batteries and accumulators included in 16 06 01, 16 06 02 or 16 06 03 and unsorted batteries and accumulators containing these batteries", hazardous: true },
  { code: "200134", description: "Batteries and accumulators other than those mentioned in 20 01 33", hazardous: false },
  { code: "200135", description: "Discarded electrical and electronic equipment other than those mentioned in 20 01 21 and 20 01 23 containing hazardous components", hazardous: true },
  { code: "200137", description: "Wood containing hazardous substances", hazardous: true },
  { code: "200139", description: "Plastics", hazardous: false },
  { code: "200202", description: "Soil and stones", hazardous: false },
  { code: "200203", description: "Other non-biodegradable wastes", hazardous: false },
  { code: "200302", description: "Waste from markets", hazardous: false },
  { code: "200303", description: "Street-cleaning residues", hazardous: false },
  { code: "200399", description: "Municipal wastes not otherwise specified", hazardous: false },
];

export const ALL_EWC: EwcCode[] = [...COMMON_EWC, ...MORE_EWC];

export function normaliseEwc(input: string): string {
  return input.replace(/[^0-9*]/g, "");
}

export function formatEwc(code: string): string {
  const d = code.replace(/\D/g, "");
  if (d.length !== 6) return code;
  return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)}`;
}

export function findEwc(code: string): EwcCode | undefined {
  const d = code.replace(/\D/g, "");
  return ALL_EWC.find((e) => e.code === d);
}

/** True when the code is hazardous: listed with an asterisk, or typed with one. */
export function isHazardousCode(code: string): boolean {
  if (code.includes("*")) return true;
  return findEwc(code)?.hazardous ?? false;
}

export function isValidEwcFormat(code: string): boolean {
  return /^\d{6}$/.test(code.replace(/\s/g, ""));
}

export function searchEwc(q: string): EwcCode[] {
  const s = q.trim().toLowerCase();
  if (!s) return ALL_EWC;
  const digits = s.replace(/[^0-9]/g, "");
  return ALL_EWC.filter(
    (e) =>
      (digits.length >= 2 && e.code.startsWith(digits)) ||
      e.description.toLowerCase().includes(s) ||
      (e.common ?? "").toLowerCase().includes(s),
  );
}
