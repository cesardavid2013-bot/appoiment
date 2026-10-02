// E2E: provider settings — profile, booking rules, policies save and persist (then restore). Usage: node scripts/flow-settings.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addCookies(JSON.parse(fs.readFileSync(`/tmp/claude-0/.auth-pro-${new URL(base).port}.json`, "utf8")).cookies);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && !/TUNNEL/.test(m.text()) && errs.push(m.text()));
const ok = (l, v) => console.log(v ? "✓" : "✗", l);
const save = async (msg) => { await page.getByRole("button", { name: "Save", exact: true }).click(); await page.getByText(msg).first().waitFor(); await page.waitForLoadState("networkidle"); };

// Profile: tagline + language tag
await page.goto(`${base}/pro/settings/profile`, { waitUntil: "networkidle" });
const tagline = page.getByRole("textbox", { name: "Tagline" });
const before = await tagline.inputValue();
await tagline.fill(before + " (e2e)");
await page.getByRole("button", { name: "+ French" }).click();
await save("Profile updated");
await page.reload({ waitUntil: "networkidle" });
ok("profile persisted", (await tagline.inputValue()).endsWith("(e2e)") && (await page.getByRole("button", { name: "Remove French" }).count()) === 1);
await tagline.fill(before);
await page.getByRole("button", { name: "Remove French" }).click();
await save("Profile updated");

// Booking rules: interval 15 → 30 → back
await page.goto(`${base}/pro/settings/booking`, { waitUntil: "networkidle" });
const interval = page.getByRole("combobox", { name: "Start times every" });
const iv = await interval.inputValue();
await interval.selectOption("30");
await save("Booking rules updated");
await page.reload({ waitUntil: "networkidle" });
ok("rules persisted", (await interval.inputValue()) === "30");
await interval.selectOption(iv);
await save("Booking rules updated");

// Policies: tax 8.875 → back
await page.goto(`${base}/pro/settings/policies`, { waitUntil: "networkidle" });
const rate = page.getByRole("textbox", { name: "Rate" });
const r0 = await rate.inputValue();
await rate.fill("8.88");
await save("Policies updated");
await page.reload({ waitUntil: "networkidle" });
ok("policies persisted", (await rate.inputValue()) === "8.88");
await rate.fill(r0);
await save("Policies updated");
ok("no console errors", errs.length === 0);
if (errs.length) console.log(errs);
await browser.close();
