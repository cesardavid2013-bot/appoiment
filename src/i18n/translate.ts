import { formatMessage, type Vars } from "./format-message";

export type Messages = { [key: string]: string | Messages };
export type TFunction = (key: string, vars?: Vars) => string;

function lookup(messages: Messages, path: string): string | undefined {
  let cur: string | Messages | undefined = messages;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** `t("home.title")`, or scoped: `makeT(m, "es", "home")("title")`. Missing keys fall back to the key itself. */
export function makeT(messages: Messages, intlLocale: string, namespace?: string): TFunction {
  return (key, vars) => {
    const full = namespace ? `${namespace}.${key}` : key;
    const template = lookup(messages, full);
    if (template == null) {
      if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing message: ${full}`);
      return full;
    }
    return formatMessage(template, vars, intlLocale);
  };
}

/** Deep merge: `over` wins, `base` fills anything not translated yet. */
export function mergeMessages(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = typeof v === "object" && v && typeof b === "object" && b ? mergeMessages(b, v) : v;
  }
  return out;
}
