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
    // Plurals must cover every form the language uses (Arabic has six, Polish four, Japanese one).
    const needed = countCategories(l.intl);
    const plurals = Object.keys(own).filter((k) => k in en && /,\s*plural\s*,/.test(own[k]) && !pluralCovers(own[k], needed));
    return { locale: l.code, total: Object.keys(en).length, translated: Object.keys(en).length - missing.length, missing, unknown, broken, plurals };
  });
  return { enKeys: Object.keys(en).length, report };
}

/** Every `{x, plural, …}` in the message has a branch for each form whole numbers take in this language. */
function pluralCovers(msg: string, needed: readonly string[]): boolean {
  const re = /\{\s*\w+\s*,\s*plural\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg))) {
    // Collect the selectors at the top level of this plural's body.
    const keys = new Set<string>();
    let depth = 0;
    let word = "";
    for (let j = m.index + m[0].length; j < msg.length; j++) {
      const ch = msg[j];
      if (ch === "{") {
        if (depth === 0) keys.add(word.trim());
        depth++;
      } else if (ch === "}") {
        if (depth === 0) break;
        depth--;
        if (depth === 0) word = "";
      } else if (depth === 0) word += ch;
    }
    if (!keys.has("other") || !needed.every((c) => keys.has(c))) return false;
  }
  return true;
}

/** Plural forms that counts (0–200) actually produce — e.g. Spanish "many" only applies to millions. */
export function countCategories(intl: string): string[] {
  const rules = new Intl.PluralRules(intl);
  const seen = new Set<string>();
  for (let n = 0; n <= 200; n++) seen.add(rules.select(n));
  return [...seen];
}
