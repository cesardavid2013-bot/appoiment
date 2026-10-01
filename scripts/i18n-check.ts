// Prints translation coverage per language and any broken or unknown keys. Usage: npm run i18n:check
import { checkLocales } from "../src/i18n/check";

const { enKeys, report } = checkLocales();
console.log(`English: ${enKeys} messages`);
let problems = 0;
for (const r of report) {
  const pct = Math.round((r.translated / Math.max(1, r.total)) * 100);
  console.log(`${r.locale.padEnd(6)} ${String(pct).padStart(3)}%  ${r.missing.length ? `${r.missing.length} missing` : "complete"}${r.unknown.length ? `, ${r.unknown.length} unknown` : ""}${r.broken.length ? `, ${r.broken.length} broken` : ""}${r.plurals.length ? `, ${r.plurals.length} incomplete plurals` : ""}`);
  for (const k of [...r.unknown, ...r.broken, ...r.plurals].slice(0, 5)) console.log(`         ${k}`);
  problems += r.unknown.length + r.broken.length + r.plurals.length;
}
process.exit(problems ? 1 : 0);
