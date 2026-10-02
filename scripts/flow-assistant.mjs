// E2E: "Ask Kept" — Spanish and English requests, follow-up context, tap a time → booking page. Usage: node scripts/flow-assistant.mjs <shotDir>
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3000";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [device, opts] of [["mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "es-US", timezoneId: "America/New_York" }], ["desktop", { viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "America/New_York" }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/TUNNEL/.test(m.text()) && errs.push(m.text()));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Ask|Preg[uú]nt/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  await page.screenshot({ path: `${out}/assistant-empty-${device}.png` });
  const box = dlg.getByRole("textbox");
  await box.fill(device === "mobile" ? "Quiero un barbero mañana por la tarde" : "gel nails this weekend under $80");
  await box.press("Enter");
  await dlg.getByRole("link", { name: /See all|Ver todos/ }).waitFor({ timeout: 15000 });
  await box.fill(device === "mobile" ? "¿y el sábado?" : "and a massage tomorrow morning");
  await box.press("Enter");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/assistant-${device}.png` });
  // Tap the first time → booking page with the time preselected.
  await dlg.locator('a[href*="/book?service="]').first().click();
  await page.waitForURL(/\/book\?service=/);
  const closed = !(await page.getByRole("dialog").isVisible().catch(() => false));
  console.log(closed ? "✓" : "✗", device, "tap a time opens", page.url().replace(base, "").split("&")[0]);
  console.log(errs.length ? `✗ ${device} console errors: ${errs.join(" | ")}` : `✓ ${device} no console errors`);
  await ctx.close();
}
await browser.close();
