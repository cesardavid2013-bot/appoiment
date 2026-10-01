// E2E: provider hours — edit weekly hours, change one date, add and remove time off. Usage: node scripts/flow-availability.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addCookies(JSON.parse(fs.readFileSync(`/tmp/claude-0/.auth-pro-${new URL(base).port}.json`, "utf8")).cookies);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const ok = (label, v) => console.log(v ? "✓" : "✗", label);
await page.goto(`${base}/pro/availability`, { waitUntil: "networkidle" });

// Weekly: open Monday, save, verify, close again.
await page.getByRole("switch", { name: "Open on Monday" }).click();
await page.getByRole("button", { name: "Save hours" }).click();
await page.getByText("Your hours are updated").waitFor();
await page.reload({ waitUntil: "networkidle" });
ok("monday opened persisted", (await page.getByRole("switch", { name: "Open on Monday" }).getAttribute("aria-checked")) === "true");
await page.getByRole("switch", { name: "Open on Monday" }).click();
await page.getByRole("button", { name: "Save hours" }).click();
await page.getByText("Your hours are updated").waitFor();

// Date override: closed in 10 days.
const d = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
await page.getByRole("button", { name: "Change one day" }).click();
await page.getByRole("dialog").getByRole("textbox", { name: "Date" }).fill(d);
await page.getByRole("radio", { name: "Closed" }).click().catch(() => page.getByText("Closed", { exact: true }).last().click());
await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
await page.getByText(/Marked as closed/).waitFor();
await page.waitForLoadState("networkidle");
ok("override listed", await page.getByRole("button", { name: `Remove the change on ${d}` }).waitFor().then(() => true, () => false));
await page.getByRole("button", { name: `Remove the change on ${d}` }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).or(page.getByRole("dialog").getByRole("button", { name: "Remove" })).click();
await page.getByText("Back to regular hours").waitFor();

// Time off: whole days.
await page.getByRole("button", { name: "Add time off" }).first().click();
const dlg = page.getByRole("dialog");
await dlg.getByText("Whole days").click();
await dlg.getByRole("button", { name: "Block time" }).click();
await page.getByText(/Time blocked/).first().waitFor();
await page.waitForLoadState("networkidle");
const rm = page.getByRole("button", { name: /^Remove time off/ }).first();
ok("time off listed", await rm.waitFor().then(() => true, () => false));
await page.screenshot({ path: (process.argv[2] ?? "/tmp") + "/availability-with-data.png", fullPage: true });
await rm.click();
await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).or(page.getByRole("dialog").getByRole("button", { name: "Remove" })).click();
await page.getByText(/Time off removed/).waitFor();
ok("no console errors", errs.length === 0);
if (errs.length) console.log(errs);
await browser.close();
