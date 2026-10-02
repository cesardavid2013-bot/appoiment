// E2E: provider service editor — edit+persist, validation, create with options, duplicate. Usage: SID=<serviceId> node scripts/flow-service-editor.mjs <shotDir>
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const SID = process.env.SID ?? fs.readFileSync("/tmp/claude-0/sid", "utf8").trim();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(JSON.parse(fs.readFileSync(`/tmp/claude-0/.auth-pro-${new URL(base).port}.json`, "utf8")).cookies);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
// 1. Edit: change description, save
await page.goto(`${base}/pro/services/${SID}`, { waitUntil: "networkidle" });
const desc = page.getByLabel("Description");
const orig = await desc.inputValue();
await desc.fill(orig + " E2E");
await page.getByText("Unsaved changes").waitFor();
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText("All changes saved").waitFor();
await page.reload({ waitUntil: "networkidle" });
console.log("persisted:", (await page.getByLabel("Description").inputValue()).endsWith(" E2E"));
await page.getByLabel("Description").fill(orig);
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText("All changes saved").waitFor();
// 2. Validation: empty name
await page.getByLabel("Service name").fill("");
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText("A few things need your attention").waitFor();
console.log("validation shown");
// 3. Create new with a variation group
await page.goto(`${base}/pro/services/new`, { waitUntil: "networkidle" });
await page.getByLabel("Service name").fill("E2E Test Service");
await page.getByRole("textbox", { name: /^Price \(/ }).fill("55");
await page.getByRole("button", { name: "Variation (choose one)" }).click();
await page.getByLabel("Group name").fill("Length");
const choices = page.getByLabel("Choice");
await choices.nth(0).fill("Short");
await choices.nth(1).fill("Long");
await page.getByLabel("Adds price").nth(1).fill("10");
await page.getByRole("button", { name: "Create service" }).click();
await page.waitForURL(/\/pro\/services\/[0-9a-f-]{36}$/);
const newId = page.url().split("/").pop();
await page.waitForLoadState("networkidle");
console.log("created:", newId, await page.getByLabel("Group name").inputValue());
// 4. Duplicate
await page.goto(`${base}/pro/services/new?copy=${newId}`, { waitUntil: "networkidle" });
console.log("copy name:", await page.getByLabel("Service name").inputValue());
await page.screenshot({ path: process.argv[2] + "/editor-new-filled.png", fullPage: false });
console.log("errors:", errs);
fs.writeFileSync("/tmp/claude-0/newsid", newId);
await browser.close();
