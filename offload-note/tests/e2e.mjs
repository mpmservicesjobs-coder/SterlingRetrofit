// End-to-end smoke test. Needs a fresh .data folder, a test CARRIER_REG_NO in
// src/config/offload.ts (put it back to "" afterwards) and `next dev -p 3100`:
//   node tests/e2e.mjs [shots-dir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100/note";
const SHOTS = process.argv[2] || ".data/shots";
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let n = 0;
const shot = async (p, name) => p.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });
const log = (...a) => console.log("✓", ...a);

async function login(ctx, name, pin) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  await p.goto(`${BASE}/login`);
  await p.fill("#name", name);
  await p.fill("#pin", pin);
  await p.click("button:has-text('Log in')");
  await p.waitForURL(`${BASE}`);
  return p;
}

async function sign(p, index) {
  const pad = p.locator("canvas.sigpad").nth(index);
  await pad.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const b = await pad.boundingBox();
  await p.mouse.move(b.x + 30, b.y + 120);
  await p.mouse.down();
  for (let i = 0; i <= 20; i++) await p.mouse.move(b.x + 30 + i * 12, b.y + 120 - Math.sin(i / 2) * 50);
  await p.mouse.up();
}

const next = (p) => p.click(".bottombar button:last-child");

// ---- admin setup ----
const adminCtx = await browser.newContext(phone);
const admin = await login(adminCtx, "Admin", "123456");
await shot(admin, "home-admin");
await admin.goto(`${BASE}/admin/sites`);
await admin.fill("h2:has-text('Add site') + form input[name=name]", "Test Recycling Ltd MRF");
await admin.fill("h2:has-text('Add site') + form input[name=address]", "1 Test Road, Leeds LS12 1AA");
await admin.fill("h2:has-text('Add site') + form input[name=permit_no]", "EPR/AB1234CD");
await admin.fill("h2:has-text('Add site') + form input[name=last_checked]", "2026-09-20");
await admin.click("button:has-text('Add site')");
await admin.waitForSelector("text=Saved.");
await admin.goto(`${BASE}/admin/vehicles`);
await admin.fill("input[name=reg]", "yx21 abc");
await admin.click("button:has-text('Add')");
await admin.waitForSelector("text=YX21 ABC added.");
await admin.goto(`${BASE}/admin/operatives`);
await admin.fill("#n", "Dave");
await admin.fill("#p", "4321");
await admin.click("button:has-text('Add operative')");
await admin.waitForSelector("text=Dave added.");
log("admin set up site, vehicle, operative");

// ---- wrong PIN ----
const badCtx = await browser.newContext(phone);
const bad = await badCtx.newPage();
await bad.goto(`${BASE}/login`);
await bad.fill("#name", "Dave");
await bad.fill("#pin", "0000");
await bad.click("button:has-text('Log in')");
await bad.waitForSelector("text=Name or PIN not recognised.");
log("wrong PIN refused");

// ---- operative: full note ----
const ctx = await browser.newContext({ ...phone, permissions: ["geolocation"] });
const p = await login(ctx, "Dave", "4321");
await p.click("text=New transfer note");
await p.waitForSelector("h1:has-text('Job')");
await p.waitForSelector(".progress >> text=OFF-");
await shot(p, "step1");
await p.click("label.choice:has-text('YX21 ABC')");
await next(p);

await p.waitForSelector("h1:has-text('Customer')");
await p.click("label.choice:has-text('Householder')");
await p.fill("#cname", "Sam Customer");
await p.fill("#addr", "12 Test Street, Pudsey");
await p.fill("#pc", "bd1 1aa");
await p.locator("#pc").blur();
await p.waitForSelector("text=outside the LS area");
await p.fill("#pc", "LS28 7AA");
await p.fill("#email", "sam@example.com");
await p.fill("#email2", "sam@example.con");
await next(p);
await p.waitForSelector("text=The two emails do not match.");
await p.fill("#email2", "sam@example.com");
await shot(p, "step2");
await next(p);

await p.waitForSelector("h1:has-text('The waste')");
await p.click("fieldset:has-text('hazardous') label.choice:has-text('No')");
await p.fill("textarea[id^=desc-]", "general waste");
await next(p);
await p.waitForSelector("text=Say what it is");
log("vague description blocked");
// hazardous code stop
await p.click("label.choice:has-text('Other code')");
await p.fill("#ewc-search", "asbestos");
await p.click("button:has-text('17 06 05*')");
await p.waitForSelector("text=Hazardous waste needs a hazardous waste consignment note");
await shot(p, "hazard-stop");
await p.click("text=Pick a different code");
log("hazardous code stopped the flow");
await p.fill("textarea[id^=desc-]", "3 seater fabric sofa");
await p.locator("textarea[id^=desc-]").blur();
await p.waitForSelector("text=Keep this separate from other waste");
const desc = await p.inputValue("textarea[id^=desc-]");
if (!desc.includes("containing POPs")) throw new Error("POPs not applied: " + desc);
if (!(await p.locator("label.choice.on:has-text('20 03 07')").count())) throw new Error("20 03 07 not picked");
log("POPs prompt applied:", desc);
await p.fill("input[id^=qty-]", "1");
await p.selectOption("select[id^=unit-]", "items");
await p.click(".card[data-line='0'] label.choice:has-text('Loose')");
await p.click("text=Add waste");
const l2 = p.locator(".card[data-line='1']");
await l2.locator("textarea").fill("Cardboard boxes and black bags of kitchen clutter");
await l2.locator("label.choice:has-text('20 03 01')").click();
await l2.locator("input[id^=qty-]").fill("6");
await l2.locator("select").selectOption("bags");
await l2.locator("label.choice:has-text('In a container')").click();
await l2.locator("label.choice:has-text('Bags')").first().click();
await shot(p, "step3");
await next(p);

await p.waitForSelector("h1:has-text('Waste hierarchy')");
await next(p);
await p.waitForSelector("text=The customer must tick this.");
await p.click("label.choice:has-text('waste hierarchy')");
await next(p);
await p.waitForSelector("h1:has-text('Offload details')");
await shot(p, "step5");
await next(p);
await p.waitForSelector("h1:has-text('Destination')");
await shot(p, "step6");
await next(p); // skip for now
await p.waitForSelector("h1:has-text('Photos')");
await p.setInputFiles("input[type=file]", "assets/offload-logo.jpg");
await p.waitForSelector(".photos img");
await next(p);

await p.waitForSelector("h1:has-text('Sign and send')");
if (!(await p.locator("button:has-text('Send note')").isDisabled())) throw new Error("Send should be disabled before signing");
await p.fill("#csn", "Sam Customer");
await sign(p, 0);
await sign(p, 1);
await shot(p, "step8");
// reload mid-way to prove the draft survives
await p.waitForTimeout(400);
await p.reload();
await p.waitForSelector("h1:has-text('Sign and send')");
if (await p.locator("#csn").inputValue() !== "Sam Customer") throw new Error("draft lost on reload");
log("draft survived reload");
await shot(p, "step8-after-reload");
await p.click("button:has-text('Send note')");
await p.waitForSelector("text=Sent to", { timeout: 30000 });
await p.waitForSelector("text=Photos uploaded: 1 of 1", { timeout: 15000 });
const noteNo = await p.locator(".result-big").innerText();
await shot(p, "sent");
log("sent", noteNo);

// ---- offline queue ----
await p.click("text=Done");
await p.click("text=New transfer note");
await p.waitForSelector(".progress >> text=OFF-");
await p.click("label.choice:has-text('YX21 ABC')");
await next(p);
await p.click("label.choice:has-text('Business')");
await p.fill("#cname", "Pat Manager");
await p.fill("#company", "Acme Lettings Ltd");
await p.fill("#addr", "Unit 4, Test Park");
await p.fill("#pc", "LS12 4AB");
await p.fill("#email", "pat@example.com");
await p.fill("#email2", "pat@example.com");
await p.click("label.choice:has-text('Producer of the waste')");
await p.fill("#sic", "68320");
await next(p);
await p.click("fieldset:has-text('hazardous') label.choice:has-text('No')");
await p.fill("textarea[id^=desc-]", "Broken plasterboard and timber offcuts from office refit");
await p.click("label.choice:has-text('17 09 04')");
await p.fill("input[id^=qty-]", "0.5");
await p.selectOption("select[id^=unit-]", "m3");
await p.click("label.choice:has-text('Loose')");
await next(p);
await p.click("label.choice:has-text('waste hierarchy')");
await next(p);
await next(p);
await p.click("label.choice:has-text('Test Recycling')");
await next(p);
await next(p);
await p.fill("#csn", "Pat Manager");
await sign(p, 0);
await sign(p, 1);
await ctx.setOffline(true);
await p.click("button:has-text('Send note')");
await p.waitForSelector("text=NOT SENT YET");
await shot(p, "queued-offline");
log("offline send queued and shown as NOT SENT YET");
await ctx.setOffline(false);
await p.evaluate(() => window.dispatchEvent(new Event("online")));
await p.waitForSelector("text=Sent to", { timeout: 30000 });
log("queued note sent after coming back online");

// ---- admin follow-up ----
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector(`text=${noteNo}`);
await shot(admin, "admin-list");
await admin.click(`text=${noteNo}`);
await admin.waitForSelector("text=destination missing");
await admin.selectOption("#siteId", { index: 1 });
admin.once("dialog", (d) => d.accept());
await admin.click("button:has-text('Save destination')");
await admin.waitForSelector("text=Destination recorded.");
await admin.reload();
await admin.waitForSelector("text=Destination record PDF");
await admin.click("button:has-text('Resend')");
await admin.waitForSelector("text=Sent.");
await shot(admin, "admin-note");
log("destination added and note resent");
const csv = await admin.evaluate(async () => (await fetch("/note/api/admin/export")).text());
console.log(csv.split("\r\n").slice(0, 3).join("\n").slice(0, 600));

// ---- operatives cannot reach admin ----
const r = await p.goto(`${BASE}/admin`);
if (!p.url().endsWith("/note")) throw new Error("operative reached admin: " + p.url());
const ex = await p.evaluate(async () => (await fetch("/note/api/admin/export")).status);
if (ex !== 403) throw new Error("export not forbidden: " + ex);
log("operative kept out of admin");

// ---- dark mode + 360px ----
const dark = await browser.newContext({ ...phone, viewport: { width: 360, height: 740 }, colorScheme: "dark" });
const dp = await login(dark, "Dave", "4321");
await shot(dp, "home-dark-360");
const overflow = await dp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) throw new Error("horizontal scroll at 360px");
await dp.click("text=New transfer note");
await dp.waitForSelector(".progress >> text=OFF-");
await dp.click("label.choice:has-text('YX21 ABC')");
await next(dp);
await shot(dp, "step2-dark-360");
log("360px dark mode ok");

await browser.close();
console.log("ALL PASSED");
