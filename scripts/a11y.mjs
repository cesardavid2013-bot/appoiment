// Accessibility scan (axe-core, WCAG 2.1 A/AA) of key pages. Usage: BASE=http://localhost:3000 node scripts/a11y.mjs
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const port = new URL(base).port;
const pages = [
  ["/", null], ["/explore", null], ["/north-fade-studio", null], ["/north-fade-studio/book", null], ["/login", null], ["/signup", null], ["/for-business", null],
  ["/bookings", "customer"], ["/account", "customer"], ["/messages", "customer"],
  ["/pro/today", "pro"], ["/pro/calendar", "pro"], ["/pro/services", "pro"], ["/pro/availability", "pro"], ["/pro/team", "pro"], ["/pro/clients", "pro"],
  ["/pro/messages", "pro"], ["/pro/insights", "pro"], ["/pro/promote", "pro"], ["/pro/reviews", "pro"], ["/pro/work", "pro"], ["/pro/settings/profile", "pro"], ["/pro/settings/booking", "pro"],
];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctxs = {};
async function ctx(login) {
  const k = login ?? "anon";
  if (ctxs[k]) return ctxs[k];
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (login) {
    const p = `/tmp/claude-0/.auth-${login}-${port}.json`;
    if (fs.existsSync(p)) await c.addCookies(JSON.parse(fs.readFileSync(p, "utf8")).cookies);
    else {
      const r = await c.request.post(`${base}/api/auth/login`, { data: { email: `${login}@kept.test`, password: "kept-demo-2026" }, headers: { origin: base } });
      if (r.ok()) fs.writeFileSync(p, JSON.stringify(await c.storageState()));
    }
  }
  return (ctxs[k] = c);
}
let total = 0;
for (const [path, login] of pages) {
  const page = await (await ctx(login)).newPage();
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of res.violations) {
    total += v.nodes.length;
    console.log(`${path} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const n of v.nodes.slice(0, 3)) console.log("    ", n.target.join(" "), "—", n.failureSummary?.split("\n")[1]?.trim().slice(0, 140));
  }
  await page.close();
}
console.log(total ? `\n${total} issues` : "No axe violations");
await browser.close();
