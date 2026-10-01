/**
 * The 30 languages Kept speaks. `intl` is the BCP 47 tag used for dates,
 * numbers and plural rules; `dir` drives right-to-left layout.
 */
export const LOCALES = [
  { code: "en", intl: "en-US", name: "English", english: "English", dir: "ltr" },
  { code: "es", intl: "es", name: "Español", english: "Spanish", dir: "ltr" },
  { code: "pt", intl: "pt-BR", name: "Português", english: "Portuguese", dir: "ltr" },
  { code: "fr", intl: "fr-FR", name: "Français", english: "French", dir: "ltr" },
  { code: "de", intl: "de-DE", name: "Deutsch", english: "German", dir: "ltr" },
  { code: "it", intl: "it-IT", name: "Italiano", english: "Italian", dir: "ltr" },
  { code: "nl", intl: "nl-NL", name: "Nederlands", english: "Dutch", dir: "ltr" },
  { code: "sv", intl: "sv-SE", name: "Svenska", english: "Swedish", dir: "ltr" },
  { code: "pl", intl: "pl-PL", name: "Polski", english: "Polish", dir: "ltr" },
  { code: "ro", intl: "ro-RO", name: "Română", english: "Romanian", dir: "ltr" },
  { code: "el", intl: "el-GR", name: "Ελληνικά", english: "Greek", dir: "ltr" },
  { code: "ru", intl: "ru-RU", name: "Русский", english: "Russian", dir: "ltr" },
  { code: "uk", intl: "uk-UA", name: "Українська", english: "Ukrainian", dir: "ltr" },
  { code: "tr", intl: "tr-TR", name: "Türkçe", english: "Turkish", dir: "ltr" },
  { code: "ar", intl: "ar", name: "العربية", english: "Arabic", dir: "rtl" },
  { code: "he", intl: "he-IL", name: "עברית", english: "Hebrew", dir: "rtl" },
  { code: "fa", intl: "fa-IR", name: "فارسی", english: "Persian", dir: "rtl" },
  { code: "ur", intl: "ur-PK", name: "اردو", english: "Urdu", dir: "rtl" },
  { code: "hi", intl: "hi-IN", name: "हिन्दी", english: "Hindi", dir: "ltr" },
  { code: "bn", intl: "bn-BD", name: "বাংলা", english: "Bengali", dir: "ltr" },
  { code: "zh", intl: "zh-CN", name: "简体中文", english: "Chinese (Simplified)", dir: "ltr" },
  { code: "zh-TW", intl: "zh-TW", name: "繁體中文", english: "Chinese (Traditional)", dir: "ltr" },
  { code: "ja", intl: "ja-JP", name: "日本語", english: "Japanese", dir: "ltr" },
  { code: "ko", intl: "ko-KR", name: "한국어", english: "Korean", dir: "ltr" },
  { code: "vi", intl: "vi-VN", name: "Tiếng Việt", english: "Vietnamese", dir: "ltr" },
  { code: "th", intl: "th-TH", name: "ไทย", english: "Thai", dir: "ltr" },
  { code: "id", intl: "id-ID", name: "Bahasa Indonesia", english: "Indonesian", dir: "ltr" },
  { code: "ms", intl: "ms-MY", name: "Bahasa Melayu", english: "Malay", dir: "ltr" },
  { code: "fil", intl: "fil-PH", name: "Filipino", english: "Filipino", dir: "ltr" },
  { code: "sw", intl: "sw-KE", name: "Kiswahili", english: "Swahili", dir: "ltr" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "kept_lang";
const CODES = new Set<string>(LOCALES.map((l) => l.code));

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && CODES.has(v);
export const localeInfo = (code: Locale) => LOCALES.find((l) => l.code === code)!;

/** Picks the best supported language from an Accept-Language header. */
export function matchLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const prefs = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((p) => p.tag && !Number.isNaN(p.q))
    .sort((a, b) => b.q - a.q);
  for (const { tag } of prefs) {
    // Chinese script/region decides simplified vs traditional.
    if (tag.startsWith("zh")) return /hant|tw|hk|mo/.test(tag) ? "zh-TW" : "zh";
    if (tag === "tl" || tag.startsWith("tl-")) return "fil";
    if (tag === "iw" || tag.startsWith("iw-")) return "he";
    const base = tag.split("-")[0];
    if (CODES.has(base)) return base as Locale;
  }
  return DEFAULT_LOCALE;
}
