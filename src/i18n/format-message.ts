/**
 * A small ICU-style message formatter: `{name}` variables, and
 * `{count, plural, one {# pro} other {# pros}}` / `{x, select, a {…} other {…}}`.
 * Enough for UI copy without shipping a full ICU runtime to the browser.
 */
export type Vars = Record<string, string | number | null | undefined>;

export function formatMessage(template: string, vars: Vars | undefined, intlLocale: string): string {
  if (!vars && !template.includes("{")) return template;
  let out = "";
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    if (open === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const close = matchBrace(template, open);
    if (close === -1) {
      out += template.slice(open);
      break;
    }
    out += renderPlaceholder(template.slice(open + 1, close), vars ?? {}, intlLocale);
    i = close + 1;
  }
  return out;
}

function matchBrace(s: string, open: number) {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return j;
  }
  return -1;
}

const pluralCache = new Map<string, Intl.PluralRules>();

function renderPlaceholder(body: string, vars: Vars, intlLocale: string): string {
  const parts = body.split(",");
  const name = parts[0].trim();
  const value = vars[name];
  if (parts.length < 3) return value == null ? "" : typeof value === "number" ? new Intl.NumberFormat(intlLocale).format(value) : String(value);
  const kind = parts[1].trim();
  const options = parseOptions(parts.slice(2).join(","));
  if (kind === "plural") {
    const n = Number(value ?? 0);
    let rules = pluralCache.get(intlLocale);
    if (!rules) pluralCache.set(intlLocale, (rules = new Intl.PluralRules(intlLocale)));
    const branch = options[`=${n}`] ?? options[rules.select(n)] ?? options.other ?? "";
    return formatMessage(branch.replace(/#/g, new Intl.NumberFormat(intlLocale).format(n)), vars, intlLocale);
  }
  if (kind === "select") return formatMessage(options[String(value)] ?? options.other ?? "", vars, intlLocale);
  return value == null ? "" : String(value);
}

function parseOptions(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{", i);
    if (open === -1) break;
    const key = s.slice(i, open).trim();
    const close = matchBrace(s, open);
    if (close === -1) break;
    out[key] = s.slice(open + 1, close);
    i = close + 1;
  }
  return out;
}
