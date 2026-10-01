// E2E: owner invites a teammate, invitee signs up from the emailed link and accepts. Usage: node scripts/flow-team-invite.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import postgres from "postgres";
const base = process.env.BASE ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/appoint_dev");
const email = `invitee-${Date.now()}@kept.test`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ok = (label, v) => console.log(v ? "✓" : "✗", label);
const errs = [];
const watch = (p) => { p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && !/422|409|403/.test(m.text()) && errs.push(m.text())); };
try {
  const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await owner.addCookies(JSON.parse(fs.readFileSync(`/tmp/claude-0/.auth-pro-${new URL(base).port}.json`, "utf8")).cookies);
  const p = await owner.newPage(); watch(p);
  await p.goto(`${base}/pro/team`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Invite someone" }).click();
  const d = p.getByRole("dialog");
  await d.getByRole("textbox", { name: "Name" }).fill("Test Invitee");
  await d.getByRole("textbox", { name: "Email" }).fill(email);
  await d.getByRole("radio", { name: /Front desk/ }).click();
  await d.getByRole("button", { name: "Send invitation" }).click();
  await p.getByText(`Invitation sent to ${email}`).waitFor();
  await p.waitForLoadState("networkidle");
  ok("invited row shown", await p.getByText(email).first().waitFor().then(() => true, () => false));
  await p.screenshot({ path: (process.argv[2] ?? "/tmp") + "/team-invited.png" });

  const [job] = await sql`select payload from jobs where type = 'email.send' and payload->>'to' = ${email} order by created_at desc limit 1`;
  const link = JSON.stringify(job?.payload ?? {}).match(/\/invite\/([A-Za-z0-9_-]+)/)?.[0];
  ok("invite email queued with link", Boolean(link));

  const inv = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const q = await inv.newPage(); watch(q);
  await q.goto(base + link, { waitUntil: "networkidle" });
  ok("invite page shows business", await q.getByRole("heading", { name: /Join North Fade Studio/ }).isVisible());
  await q.screenshot({ path: (process.argv[2] ?? "/tmp") + "/invite-page.png" });
  const res = await inv.request.post(`${base}/api/auth/signup`, { data: { name: "Test Invitee", email, password: "invitee-pass-2026!" }, headers: { origin: base } });
  ok("signed up", res.ok());
  await q.goto(base + link, { waitUntil: "networkidle" });
  await q.getByRole("button", { name: "Accept and open my schedule" }).click();
  await q.waitForURL(/\/pro\/today/);
  ok("lands in console", true);
  const denied = await inv.request.get(`${base}/pro/team`);
  ok("front desk can't open team page (404)", denied.status() === 404);
  ok("invite link is single-use", (await inv.request.post(`${base}${link.replace("/invite/", "/api/invites/")}/accept`, { data: {}, headers: { origin: base } })).status() >= 400);
} finally {
  const [u] = await sql`select id from users where email = ${email}`;
  await sql`delete from business_members where invite_email = ${email} or user_id = ${u?.id ?? null}`;
  if (u) { await sql`delete from sessions where user_id = ${u.id}`; await sql`delete from audit_logs where actor_user_id = ${u.id}`; await sql`delete from users where id = ${u.id}`.catch((e) => console.log("user cleanup:", e.message)); }
  await sql`delete from rate_limits where key like '%invite%'`.catch(() => {});
  ok("no console errors", errs.length === 0); if (errs.length) console.log(errs);
  await browser.close(); await sql.end();
}
