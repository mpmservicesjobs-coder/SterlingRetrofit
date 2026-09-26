import { describe, expect, it } from "vitest";
import {
  detectPops,
  emptyNote,
  fullDescription,
  isInServiceArea,
  isValidPostcode,
  newLine,
  normalisePostcode,
  POPS_CHEMICALS,
  POPS_DESCRIPTION,
  sicDisplay,
  vagueDescriptionError,
  validateForSubmit,
  validateLine,
  validateStep,
  WasteLine,
} from "@/lib/note";
import { COMMON_EWC, findEwc, formatEwc, isHazardousCode, searchEwc } from "@/lib/ewc";

const goodLine = (p: Partial<WasteLine> = {}): WasteLine => ({
  ...newLine(),
  description: "Mixed household clearance of furniture, cardboard and bags",
  ewc: "200301",
  quantity: "1",
  unit: "van",
  packaging: "loose",
  ...p,
});

describe("vague descriptions", () => {
  it.each(["general waste", "Rubbish", "builders waste", "Builder's waste", "junk", "mixed waste", "general rubbish", "stuff", "waste"])(
    "blocks %s",
    (d) => expect(vagueDescriptionError(d)).not.toBeNull(),
  );
  it.each([
    "Mixed household clearance of furniture, cardboard and bags",
    "Rubbish from garage: old bikes and paint-free timber",
    "Broken plasterboard and timber offcuts",
    "Garden hedge cuttings and grass",
  ])("allows %s", (d) => expect(vagueDescriptionError(d)).toBeNull());
});

describe("POPs detection", () => {
  it.each(["3 seater sofa", "Two armchairs", "leather settee", "corner couch", "sofa bed", "recliner chair", "bean bag", "footstool"])(
    "strong match: %s",
    (d) => expect(detectPops(d)).toBe("yes"),
  );
  it.each(["4 dining chairs", "bar stools", "cushions"])("asks: %s", (d) => expect(detectPops(d)).toBe("maybe"));
  it.each(["double mattress", "curtains and blinds", "divan bed", "single bed frame", "wardrobe and chest of drawers"])(
    "never for %s",
    (d) => expect(detectPops(d)).toBe("no"),
  );
  it("POPs line carries the fixed chemical text and must be 20 03 07", () => {
    const l = goodLine({ pops: true, description: POPS_DESCRIPTION, ewc: "200301" });
    expect(fullDescription(l)).toContain(POPS_CHEMICALS);
    expect(validateLine(l).ewc).toMatch(/20 03 07/);
    expect(validateLine({ ...l, ewc: "200307" })).toEqual({});
    expect(validateLine({ ...l, ewc: "200307", description: "A sofa, two seater" }).description).toMatch(/POPs/);
  });
});

describe("EWC", () => {
  it("common codes exist and are non-hazardous", () => {
    expect(COMMON_EWC.map((c) => formatEwc(c.code))).toEqual(["20 03 01", "20 03 07", "17 09 04", "20 02 01", "20 01 38", "20 01 40", "20 01 36"]);
    for (const c of COMMON_EWC) expect(c.hazardous).toBe(false);
  });
  it("asterisk codes are hazardous", () => {
    expect(isHazardousCode("170605")).toBe(true); // asbestos
    expect(isHazardousCode("200123")).toBe(true); // fridges
    expect(isHazardousCode("123456*")).toBe(true);
    expect(isHazardousCode("200301")).toBe(false);
  });
  it("search finds by code and words", () => {
    expect(searchEwc("17 01").map((e) => e.code)).toContain("170107");
    expect(searchEwc("bricks").map((e) => e.code)).toContain("170102");
    expect(findEwc("20 03 07")?.description).toBe("Bulky waste");
  });
  it("a line with a hazardous code is never valid", () => {
    expect(validateLine(goodLine({ ewc: "170605" })).ewc).toMatch(/Hazardous/);
    expect(validateLine(goodLine({ ewc: "" })).ewc).toBeTruthy();
    expect(validateLine(goodLine({ ewc: "12345" })).ewc).toMatch(/six digits/);
  });
});

describe("customer rules", () => {
  it("postcodes", () => {
    expect(isValidPostcode("LS28 5LY")).toBe(true);
    expect(isValidPostcode("ls285ly")).toBe(true);
    expect(isValidPostcode("LS28")).toBe(false);
    expect(normalisePostcode("ls285ly")).toBe("LS28 5LY");
    expect(isInServiceArea("LS1 4AP")).toBe(true);
    expect(isInServiceArea("BD1 1AA")).toBe(false);
    expect(isInServiceArea("L1 8JQ")).toBe(false);
  });
  it("SIC for business, not applicable for householder", () => {
    const n = emptyNote("x");
    Object.assign(n, { customerType: "business", customerName: "A", companyName: "B", address: "1 St", postcode: "LS1 4AP", email: "a@b.co", emailConfirm: "a@b.co", capacity: "producer" });
    expect(validateStep(2, n).sic).toBeTruthy();
    n.sic = "43390";
    expect(validateStep(2, n)).toEqual({});
    expect(sicDisplay({ customerType: "householder", sic: "" })).toBe("Not applicable (household waste)");
  });
  it("emails must match", () => {
    const n = emptyNote("x");
    Object.assign(n, { customerType: "householder", customerName: "A", address: "1 St", postcode: "LS1 4AP", email: "a@b.co", emailConfirm: "a@b.con", capacity: "householder" });
    expect(validateStep(2, n).emailConfirm).toBeTruthy();
  });
});

describe("submit", () => {
  const full = () => {
    const n = emptyNote("x");
    Object.assign(n, {
      vehicle: "AB12 CDE",
      customerType: "householder", customerName: "Sam Test", address: "1 Street", postcode: "LS1 4AP",
      email: "a@b.co", emailConfirm: "a@b.co", capacity: "householder",
      hazardous: "no", lines: [goodLine()], hierarchyConfirmed: true,
      customerSignName: "Sam Test", operativeSignName: "Op",
    });
    return n;
  };
  it("complete note passes", () => expect(validateForSubmit(full(), true)).toEqual({}));
  it("hierarchy tick required", () => expect(validateForSubmit({ ...full(), hierarchyConfirmed: false }, true).hierarchyConfirmed).toBeTruthy());
  it("hazardous yes blocks", () => expect(validateForSubmit({ ...full(), hazardous: "yes" }, true).hazardous).toBeTruthy());
  it("destination can be missing", () => expect(validateForSubmit({ ...full(), destinationSiteId: null }, true)).toEqual({}));
  it("no email: save allowed, send blocked", () => {
    const n = { ...full(), noEmail: true, email: "", emailConfirm: "" };
    expect(validateForSubmit(n, false)).toEqual({});
    expect(validateForSubmit(n, true).email).toBeTruthy();
  });
});
