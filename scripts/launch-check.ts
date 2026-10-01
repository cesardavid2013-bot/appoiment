// Is this environment ready to take real bookings and money? Usage: npm run launch:check
// Reads the same variables the app reads (.env.local / .env / the shell). Exits 1 if anything blocks launch.
import "dotenv/config";
import { launchChecks, launchVerdict } from "../src/domain/launch-check";

const checks = launchChecks(process.env);
const icon = { ok: "✓", warning: "!", blocker: "✗" } as const;
for (const c of checks) {
  console.log(`${icon[c.severity]} ${c.title}`);
  if (c.severity !== "ok" && c.detail) console.log(`    ${c.detail}`);
}
const v = launchVerdict(checks);
console.log(`\n${v.ready ? "Ready to take payments." : `${v.blockers} thing${v.blockers === 1 ? "" : "s"} to fix before launch.`}${v.warnings ? ` ${v.warnings} recommendation${v.warnings === 1 ? "" : "s"}.` : ""}`);
process.exit(v.ready ? 0 : 1);
