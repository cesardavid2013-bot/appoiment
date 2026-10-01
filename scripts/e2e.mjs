// Runs every end-to-end flow against a running app (dev or production build) with the demo seed.
// For development/staging databases only: it creates throwaway accounts and removes them afterwards.
// Usage: BASE=http://localhost:3000 npm run e2e
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import postgres from "postgres";
import "dotenv/config";

const base = process.env.BASE ?? "http://localhost:3000";
const port = new URL(base).port || "80";
fs.mkdirSync("/tmp/claude-0", { recursive: true });

// Sign the demo accounts in once and share their sessions with every flow.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const who of ["pro", "customer"]) {
  const file = `/tmp/claude-0/.auth-${who}-${port}.json`;
  const ctx = await browser.newContext();
  if (fs.existsSync(file)) await ctx.addCookies(JSON.parse(fs.readFileSync(file, "utf8")).cookies);
  if (!(await ctx.request.get(`${base}/api/me/badges`)).ok()) {
    const res = await ctx.request.post(`${base}/api/auth/login`, { data: { email: `${who}@kept.test`, password: "kept-demo-2026" }, headers: { origin: base } });
    if (!res.ok()) throw new Error(`Couldn't sign in ${who}@kept.test — is the demo seed loaded? (${res.status()})`);
    fs.writeFileSync(file, JSON.stringify(await ctx.storageState()));
  }
  await ctx.close();
}
await browser.close();

const sql = postgres(process.env.DATABASE_URL);
const [svc] = await sql`select s.id from services s join businesses b on b.id = s.business_id where b.slug = 'north-fade-studio' and s.status = 'active' and exists (select 1 from service_option_groups g where g.service_id = s.id) limit 1`;

const out = "/tmp/claude-0/e2e";
fs.mkdirSync(out, { recursive: true });
const flows = [
  ["Customer books (desktop)", "scripts/flow-booking.mjs", [out, "desktop"]],
  ["Customer books (mobile)", "scripts/flow-booking.mjs", [out, "mobile"]],
  ["Service editor", "scripts/flow-service-editor.mjs", [out]],
  ["Hours & time off", "scripts/flow-availability.mjs", [out]],
  ["Team invite", "scripts/flow-team-invite.mjs", [out]],
  ["Settings", "scripts/flow-settings.mjs", [out]],
  ["Accessibility", "scripts/a11y.mjs", []],
];
let failed = 0;
for (const [name, file, args] of flows) {
  process.stdout.write(`\n▸ ${name}\n`);
  try {
    const text = execFileSync("node", [file, ...args], { env: { ...process.env, BASE: base, SID: svc?.id ?? "" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
    process.stdout.write(text);
    if (/✗|ERRORS:|axe violations?\b(?!.*No)|\d+ issues/.test(text) && !/No axe violations/.test(text)) failed++;
  } catch (err) {
    failed++;
    process.stdout.write(String(err.stdout ?? "") + String(err.stderr ?? err.message).split("\n").slice(0, 12).join("\n") + "\n");
  }
}
await sql.begin((tx) => tx.file("scripts/e2e-cleanup.sql"));
await sql.end();
console.log(failed ? `\n${failed} flow(s) failed` : "\nAll flows passed");
process.exit(failed ? 1 : 0);
