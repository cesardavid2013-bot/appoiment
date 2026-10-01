// Usage: node scripts/shots.mjs <outDir> <path>[@mobile|@desktop][#login=customer|pro|admin] ...
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [outDir, ...targets] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const accounts = { customer: "customer@kept.test", pro: "pro@kept.test", admin: "admin@kept.test" };
const contexts = {};
async function ctxFor(device, login) {
  const key = `${device}:${login ?? ""}`;
  if (contexts[key]) return contexts[key];
  const ctx = await browser.newContext(
    device === "mobile"
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  );
  if (login) {
    // Reuse a saved session per account so repeated runs don't trip the login rate limiter.
    const statePath = `/tmp/claude-0/.auth-${login}-${new URL(base).port}.json`;
    let ok = false;
    if (fs.existsSync(statePath)) {
      await ctx.addCookies(JSON.parse(fs.readFileSync(statePath, "utf8")).cookies);
      ok = (await ctx.request.get(`${base}/api/me/badges`)).ok();
    }
    if (!ok) {
      const res = await ctx.request.post(`${base}/api/auth/login`, { data: { email: accounts[login], password: "kept-demo-2026" }, headers: { origin: base } });
      if (!res.ok()) console.error("login failed", login, await res.text());
      else fs.writeFileSync(statePath, JSON.stringify(await ctx.storageState()));
    }
  }
  contexts[key] = ctx;
  return ctx;
}
const errors = [];
for (const t of targets) {
  const [pathPart, loginPart] = t.split("#login=");
  const [path, device = "desktop"] = pathPart.split("@");
  const ctx = await ctxFor(device, loginPart);
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${path}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) errors.push(`${path} (${device}): horizontal overflow ${overflow}px`);
  const name = `${path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${device}${loginPart ? "-" + loginPart : ""}.png`;
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
  console.log("shot", name);
  await page.close();
}
if (errors.length) console.log("CONSOLE ERRORS:\n" + errors.join("\n"));
await browser.close();
