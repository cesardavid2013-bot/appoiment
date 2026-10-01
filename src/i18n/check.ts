/** Compares every language's messages with English: missing keys, unknown keys, broken placeholders. */
import fs from "node:fs";
import path from "node:path";
import { LOCALES } from "./locales";

type Tree = { [k: string]: string | Tree };
const DIR = path.join(process.cwd(), "src/i18n/messages");

function flatten(tree: Tree, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

export function loadFlat(locale: string): Record<string, string> {
  const dir = path.join(DIR, locale);
  if (!fs.existsSync(dir)) return {};
  const out: Record<string, string> = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    Object.assign(out, flatten(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Tree, f.replace(/\.json$/, "")));
  }
  return out;
}

/** Variable names a message uses: {name} and the subject of {count, plural, …}. */
export function placeholders(msg: string): string[] {
  const names = new Set<string>();
  const re = /\{\s*([A-Za-z_][\w]*)\s*(?:,|\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg))) names.add(m[1]);
  return [...names].sort();
}

export function checkLocales() {
  const en = loadFlat("en");
  const report = LOCALES.filter((l) => l.code !== "en").map((l) => {
    const own = loadFlat(l.code);
    const missing = Object.keys(en).filter((k) => !(k in own));
    const unknown = Object.keys(own).filter((k) => !(k in en));
    const broken = Object.keys(own).filter((k) => k in en && placeholders(own[k]).join() !== placeholders(en[k]).join());
    return { locale: l.code, total: Object.keys(en).length, translated: Object.keys(en).length - missing.length, missing, unknown, broken };
  });
  return { enKeys: Object.keys(en).length, report };
}
