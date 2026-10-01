/**
 * How a professional dresses their public page: masthead, accent colour,
 * which sections show and in what order, a short notice and a few link
 * buttons. Stored as one small JSON document and validated here — the page
 * only ever renders values that pass `normalizeTheme`.
 */
export const MASTHEADS = ["noir", "ivory"] as const;
export type Masthead = (typeof MASTHEADS)[number];

export const ACCENTS = ["brass", "emerald", "rose", "sapphire", "copper"] as const;
export type Accent = (typeof ACCENTS)[number];

/** Sections that can move or hide. Services stays first and Reviews can't be hidden: both are what makes the page trustworthy. */
export const MOVABLE_SECTIONS = ["work", "featured", "team", "reviews", "about"] as const;
export type MovableSection = (typeof MOVABLE_SECTIONS)[number];
export const HIDEABLE_SECTIONS = ["work", "featured", "team"] as const satisfies readonly MovableSection[];

export const MAX_LINKS = 8;
export const MAX_NOTICE = 160;

export type ThemeLink = { label: string; url: string };
export type ProfileTheme = {
  masthead: Masthead;
  accent: Accent;
  /** Display order of the movable sections. */
  order: MovableSection[];
  hidden: MovableSection[];
  notice: string | null;
  links: ThemeLink[];
};

export const DEFAULT_THEME: ProfileTheme = { masthead: "noir", accent: "brass", order: [...MOVABLE_SECTIONS], hidden: [], notice: null, links: [] };

type Tones = { gold: string; goldText: string; goldSoft: string };
/** Light surfaces use the deep tone (readable text on ivory); dark surfaces use the lifted one. */
export const ACCENT_TONES: Record<Accent, { light: Tones; dark: Tones; swatch: string }> = {
  brass: { light: { gold: "#a8843e", goldText: "#7a5b22", goldSoft: "#f1e7d3" }, dark: { gold: "#c9a865", goldText: "#d8bb7e", goldSoft: "#2a2316" }, swatch: "#c9a865" },
  emerald: { light: { gold: "#3f7a5a", goldText: "#2c5a41", goldSoft: "#dcebe2" }, dark: { gold: "#6fb592", goldText: "#8fcdae", goldSoft: "#15281f" }, swatch: "#4b8f6b" },
  rose: { light: { gold: "#b0566a", goldText: "#8a3d50", goldSoft: "#f3dde3" }, dark: { gold: "#d98aa0", goldText: "#e8a8ba", goldSoft: "#2d1920" }, swatch: "#c46f85" },
  sapphire: { light: { gold: "#3f68a8", goldText: "#2c4f86", goldSoft: "#dbe4f3" }, dark: { gold: "#7ea3dd", goldText: "#9dbbe8", goldSoft: "#172134" }, swatch: "#5a82c0" },
  copper: { light: { gold: "#b4612f", goldText: "#8d4821", goldSoft: "#f3e0d3" }, dark: { gold: "#d98b5b", goldText: "#e8a67b", goldSoft: "#2c1a10" }, swatch: "#c9733f" },
};

/** Inline custom properties that retint the brass details on light or dark surfaces. */
export function accentVars(accent: Accent, surface: "light" | "dark"): Record<string, string> {
  const t = ACCENT_TONES[accent][surface];
  return { "--gold": t.gold, "--gold-text": t.goldText, "--gold-soft": t.goldSoft };
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** A link button target: https only, no credentials, no odd ports, sane length. */
export function safeThemeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > 300) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Accepts anything (database value, request body) and returns a safe, complete theme. */
export function normalizeTheme(input: unknown): ProfileTheme {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const order: MovableSection[] = [];
  if (Array.isArray(src.order)) for (const s of src.order) if (oneOf(MOVABLE_SECTIONS, s) && !order.includes(s)) order.push(s);
  for (const s of MOVABLE_SECTIONS) if (!order.includes(s)) order.push(s);
  const hidden: MovableSection[] = [];
  if (Array.isArray(src.hidden)) for (const s of src.hidden) if (oneOf(HIDEABLE_SECTIONS, s) && !hidden.includes(s)) hidden.push(s);
  const links: ThemeLink[] = [];
  if (Array.isArray(src.links)) {
    for (const l of src.links) {
      if (links.length >= MAX_LINKS || !l || typeof l !== "object") continue;
      const label = typeof (l as ThemeLink).label === "string" ? (l as ThemeLink).label.replace(/\s+/g, " ").trim().slice(0, 40) : "";
      const url = safeThemeUrl((l as ThemeLink).url);
      if (label && url) links.push({ label, url });
    }
  }
  const notice = typeof src.notice === "string" ? src.notice.replace(/\s+/g, " ").trim().slice(0, MAX_NOTICE) : "";
  return {
    masthead: oneOf(MASTHEADS, src.masthead) ? src.masthead : DEFAULT_THEME.masthead,
    accent: oneOf(ACCENTS, src.accent) ? src.accent : DEFAULT_THEME.accent,
    order,
    hidden,
    notice: notice || null,
    links,
  };
}
