import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, localeInfo, matchLocale, type Locale } from "./locales";
import { NAMESPACES } from "./namespaces";
import { makeT, mergeMessages, type Messages } from "./translate";

/** The visitor's language: their explicit choice, else their browser's, else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return matchLocale((await headers()).get("accept-language"));
});

async function loadLocale(locale: Locale): Promise<Messages> {
  const parts = await Promise.all(
    NAMESPACES.map((ns) =>
      import(`./messages/${locale}/${ns}.json`).then(
        (m: { default: Messages }) => ({ [ns]: m.default }) as Messages,
        () => ({}) as Messages,
      ),
    ),
  );
  return parts.reduce<Messages>((acc, p) => ({ ...acc, ...p }), {});
}

const loaded = new Map<Locale, Promise<Messages>>();

/** Messages for a language with English filling any gaps. Cached per process. */
export function getMessages(locale: Locale): Promise<Messages> {
  let p = loaded.get(locale);
  if (!p) {
    p = locale === DEFAULT_LOCALE ? loadLocale(locale) : Promise.all([loadLocale(DEFAULT_LOCALE), loadLocale(locale)]).then(([en, own]) => mergeMessages(en, own));
    // Don't cache in development so edits to the JSON show up immediately.
    if (process.env.NODE_ENV === "production") loaded.set(locale, p);
  }
  return p;
}

/** Server-side translator: `const t = await getT("home"); t("title")`. */
export async function getT(namespace?: string) {
  const locale = await getLocale();
  return makeT(await getMessages(locale), localeInfo(locale).intl, namespace);
}

export async function getI18n() {
  const locale = await getLocale();
  const info = localeInfo(locale);
  return { locale, intl: info.intl, dir: info.dir, messages: await getMessages(locale) };
}

/** Namespaces only the professional console or the admin use; the rest of the site never ships them. */
const CONSOLE_ONLY = new Set(["pro", "proSetup", "proSettings", "admin"]);
/** Server-rendered only: never sent to the browser. */
const SERVER_ONLY = new Set(["email"]);

/**
 * The messages a client bundle needs for one area of the app. The console
 * namespaces are large, so public pages leave them out; legal text stays on the
 * server apart from its tab labels.
 */
export async function getClientMessages(area: "site" | "console"): Promise<Messages> {
  const locale = await getLocale();
  const all = await getMessages(locale);
  const out: Messages = {};
  for (const [ns, v] of Object.entries(all)) {
    if (SERVER_ONLY.has(ns)) continue;
    if (area === "site" && CONSOLE_ONLY.has(ns)) continue;
    if (ns === "legal") {
      out.legal = { nav: (v as Messages).nav ?? {} };
      continue;
    }
    out[ns] = v;
  }
  return out;
}

/** Same, for a known language (emails, notifications) instead of the current request's. */
export async function getTFor(locale: Locale, namespace?: string) {
  return makeT(await getMessages(locale), localeInfo(locale).intl, namespace);
}

/** The current request's language, or English when there is no request (jobs, scripts, tests). */
export async function getLocaleSafe(): Promise<Locale> {
  try {
    return await getLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}
