/**
 * Social profiles and embeddable posts.
 *
 * Everything here is pure and runs on both server and client: the pro console
 * uses it for instant previews, the server re-parses before saving, and the
 * public profile rebuilds every link and iframe `src` from the parsed parts.
 * User input is never rendered as a URL directly.
 */

/* ───────────────────────────── Social profiles ───────────────────────────── */

export const SOCIAL_KEYS = ["instagram", "tiktok", "youtube", "facebook", "x", "linkedin", "spotify", "soundcloud", "behance", "pinterest", "twitch", "threads"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

type SocialSpec = {
  label: string;
  placeholder: string;
  hosts: string[];
  /** Turns a profile URL path into the stored value, or null when it isn't a profile link. */
  fromPath: (segments: string[], search: URLSearchParams) => string | null;
  /** Turns plain typed text (no URL) into the stored value. */
  fromText: (text: string) => string | null;
  /** Rebuilds the public link from a stored value; null when the value is invalid. */
  href: (value: string) => string | null;
  /** How the handle reads next to the icon. */
  display: (value: string) => string;
};

const IG_USER = /^[A-Za-z0-9._]{1,30}$/;
const TT_USER = /^[A-Za-z0-9._]{2,24}$/;
const YT_HANDLE = /^[A-Za-z0-9._-]{3,30}$/;
const YT_CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const YT_LEGACY = /^[A-Za-z0-9._-]{1,100}$/;
const FB_PAGE = /^[A-Za-z0-9.-]{3,80}$/;
const FB_ID = /^\d{5,20}$/;
const X_USER = /^[A-Za-z0-9_]{1,15}$/;
const LI_SLUG = /^[A-Za-z0-9_-]{2,100}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_USER = /^[A-Za-z0-9._-]{1,64}$/;
const SC_USER = /^[a-z0-9][a-z0-9_-]{1,59}$/;
const BE_USER = /^[A-Za-z0-9_-]{2,60}$/;
const PIN_USER = /^[A-Za-z0-9_]{3,30}$/;
const TW_USER = /^[A-Za-z0-9_]{3,25}$/;

const at = (s: string) => s.replace(/^@/, "");
const match = (re: RegExp, s: string | undefined) => (s && re.test(s) ? s : null);

const SC_RESERVED = new Set(["discover", "stream", "search", "upload", "you", "charts", "pages", "settings", "messages", "notifications", "people", "tags", "popular", "terms-of-use", "jobs", "mobile", "pro", "signin", "logout", "imprint", "community-guidelines"]);
const IG_RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "developer", "legal"]);

export const SOCIAL: Record<SocialKey, SocialSpec> = {
  instagram: {
    label: "Instagram",
    placeholder: "@yourname",
    hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
    fromPath: ([u]) => (u && !IG_RESERVED.has(u.toLowerCase()) ? match(IG_USER, u) : null),
    fromText: (t) => match(IG_USER, at(t)),
    href: (v) => (IG_USER.test(v) ? `https://www.instagram.com/${v}/` : null),
    display: (v) => `@${v}`,
  },
  tiktok: {
    label: "TikTok",
    placeholder: "@yourname",
    hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
    fromPath: ([u]) => (u?.startsWith("@") ? match(TT_USER, at(u)) : null),
    fromText: (t) => match(TT_USER, at(t)),
    href: (v) => (TT_USER.test(v) ? `https://www.tiktok.com/@${v}` : null),
    display: (v) => `@${v}`,
  },
  youtube: {
    label: "YouTube",
    placeholder: "@yourchannel",
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com"],
    fromPath: ([a, b]) => {
      if (a?.startsWith("@")) return YT_HANDLE.test(at(a)) ? a : null;
      if (a === "channel" && b && YT_CHANNEL.test(b)) return `channel/${b}`;
      if ((a === "c" || a === "user") && b && YT_LEGACY.test(b)) return `${a}/${b}`;
      return null;
    },
    fromText: (t) => (YT_CHANNEL.test(t) ? `channel/${t}` : YT_HANDLE.test(at(t)) ? `@${at(t)}` : null),
    href: (v) => {
      if (v.startsWith("@") && YT_HANDLE.test(at(v))) return `https://www.youtube.com/${v}`;
      const [a, b] = v.split("/");
      if (a === "channel" && b && YT_CHANNEL.test(b)) return `https://www.youtube.com/channel/${b}`;
      if ((a === "c" || a === "user") && b && YT_LEGACY.test(b)) return `https://www.youtube.com/${a}/${b}`;
      return null;
    },
    display: (v) => (v.startsWith("@") ? v : "YouTube channel"),
  },
  facebook: {
    label: "Facebook",
    placeholder: "yourpage",
    hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "www.fb.com"],
    fromPath: ([a], search) => {
      if (a === "profile.php") return match(FB_ID, search.get("id") ?? undefined) && `id:${search.get("id")}`;
      if (!a || ["pages", "groups", "events", "watch", "share", "sharer", "login", "photo", "story.php", "permalink.php"].includes(a)) return null;
      return match(FB_PAGE, a);
    },
    fromText: (t) => match(FB_PAGE, at(t)),
    href: (v) => (v.startsWith("id:") ? (FB_ID.test(v.slice(3)) ? `https://www.facebook.com/profile.php?id=${v.slice(3)}` : null) : FB_PAGE.test(v) ? `https://www.facebook.com/${v}` : null),
    display: (v) => (v.startsWith("id:") ? "Facebook" : v),
  },
  x: {
    label: "X",
    placeholder: "@yourname",
    hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "mobile.x.com"],
    fromPath: ([u]) => (u && !["home", "i", "intent", "search", "share", "hashtag", "explore", "settings"].includes(u) ? match(X_USER, u) : null),
    fromText: (t) => match(X_USER, at(t)),
    href: (v) => (X_USER.test(v) ? `https://x.com/${v}` : null),
    display: (v) => `@${v}`,
  },
  linkedin: {
    label: "LinkedIn",
    placeholder: "in/yourname",
    hosts: ["linkedin.com", "www.linkedin.com", "m.linkedin.com"],
    fromPath: ([a, b]) => ((a === "in" || a === "company") && b && LI_SLUG.test(b) ? `${a}/${b}` : null),
    fromText: (t) => {
      const [a, b] = t.split("/");
      if ((a === "in" || a === "company") && b) return LI_SLUG.test(b) ? `${a}/${b}` : null;
      return LI_SLUG.test(t) ? `in/${t}` : null;
    },
    href: (v) => {
      const [a, b] = v.split("/");
      return (a === "in" || a === "company") && b && LI_SLUG.test(b) ? `https://www.linkedin.com/${a}/${b}/` : null;
    },
    display: (v) => v.split("/")[1] ?? v,
  },
  spotify: {
    label: "Spotify",
    placeholder: "Artist link",
    hosts: ["open.spotify.com"],
    fromPath: (segs) => {
      const [a, b] = segs[0]?.startsWith("intl-") ? segs.slice(1) : segs;
      if (a === "artist" && b && SPOTIFY_ID.test(b)) return `artist/${b}`;
      if (a === "user" && b && SPOTIFY_USER.test(b)) return `user/${b}`;
      return null;
    },
    fromText: (t) => {
      const uri = /^spotify:artist:([A-Za-z0-9]{22})$/.exec(t);
      if (uri) return `artist/${uri[1]}`;
      return SPOTIFY_ID.test(t) ? `artist/${t}` : null;
    },
    href: (v) => {
      const [a, b] = v.split("/");
      if (a === "artist" && b && SPOTIFY_ID.test(b)) return `https://open.spotify.com/artist/${b}`;
      if (a === "user" && b && SPOTIFY_USER.test(b)) return `https://open.spotify.com/user/${b}`;
      return null;
    },
    display: (v) => (v.startsWith("user/") ? v.slice(5) : "Spotify"),
  },
  soundcloud: {
    label: "SoundCloud",
    placeholder: "yourname",
    hosts: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"],
    fromPath: ([u]) => (u && !SC_RESERVED.has(u.toLowerCase()) ? match(SC_USER, u.toLowerCase()) : null),
    fromText: (t) => (SC_RESERVED.has(at(t).toLowerCase()) ? null : match(SC_USER, at(t).toLowerCase())),
    href: (v) => (SC_USER.test(v) ? `https://soundcloud.com/${v}` : null),
    display: (v) => v,
  },
  behance: {
    label: "Behance",
    placeholder: "yourname",
    hosts: ["behance.net", "www.behance.net"],
    fromPath: ([u]) => (u && !["gallery", "search", "galleries", "joblist", "live", "assets"].includes(u) ? match(BE_USER, u) : null),
    fromText: (t) => match(BE_USER, at(t)),
    href: (v) => (BE_USER.test(v) ? `https://www.behance.net/${v}` : null),
    display: (v) => v,
  },
  pinterest: {
    label: "Pinterest",
    placeholder: "yourname",
    hosts: ["pinterest.com", "www.pinterest.com", "pinterest.co.uk", "www.pinterest.co.uk", "pinterest.ca", "www.pinterest.ca", "pinterest.es", "www.pinterest.es", "pinterest.com.mx", "www.pinterest.com.mx", "pinterest.fr", "www.pinterest.fr", "pinterest.de", "www.pinterest.de"],
    fromPath: ([u]) => (u && !["pin", "search", "ideas", "today", "business", "settings"].includes(u) ? match(PIN_USER, u) : null),
    fromText: (t) => match(PIN_USER, at(t)),
    href: (v) => (PIN_USER.test(v) ? `https://www.pinterest.com/${v}/` : null),
    display: (v) => v,
  },
  twitch: {
    label: "Twitch",
    placeholder: "yourchannel",
    hosts: ["twitch.tv", "www.twitch.tv", "m.twitch.tv"],
    fromPath: ([u]) => (u && !["directory", "videos", "settings", "downloads", "jobs", "p", "search"].includes(u) ? match(TW_USER, u) : null),
    fromText: (t) => match(TW_USER, at(t)),
    href: (v) => (TW_USER.test(v) ? `https://www.twitch.tv/${v}` : null),
    display: (v) => v,
  },
  threads: {
    label: "Threads",
    placeholder: "@yourname",
    hosts: ["threads.net", "www.threads.net", "threads.com", "www.threads.com"],
    fromPath: ([u]) => (u?.startsWith("@") ? match(IG_USER, at(u)) : null),
    fromText: (t) => match(IG_USER, at(t)),
    href: (v) => (IG_USER.test(v) ? `https://www.threads.com/@${v}` : null),
    display: (v) => `@${v}`,
  },
};

/** Parses anything that looks like a URL, adding https:// when the scheme is missing. Returns null for non-web URLs. */
function looseUrl(raw: string): URL | null {
  const t = raw.trim();
  const looksLikeUrl = /^https?:\/\//i.test(t) || /^(www\.|m\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/|$)/i.test(t);
  if (!looksLikeUrl) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || u.port) return null;
    return u;
  } catch {
    return null;
  }
}

const segmentsOf = (u: URL) =>
  u.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });

export type SocialResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Normalizes what a pro typed — "@name", "name" or a full profile link — into
 * the stored value for that network. Links must point at that network's own host.
 */
export function normalizeSocial(key: SocialKey, raw: string): SocialResult {
  const spec = SOCIAL[key];
  const text = raw.trim();
  if (!text) return { ok: true, value: "" };
  const url = looseUrl(text);
  // "north.fade" is a valid Instagram handle that also parses as a domain: only treat
  // it as a link when it has a scheme, a path, or the network's own host.
  if (url && (/^https?:\/\//i.test(text) || text.includes("/") || spec.hosts.includes(url.hostname.toLowerCase()))) {
    if (!spec.hosts.includes(url.hostname.toLowerCase())) return { ok: false, error: `That isn't a ${spec.label} link.` };
    const v = spec.fromPath(segmentsOf(url), url.searchParams);
    return v ? { ok: true, value: v } : { ok: false, error: `Use the link to your ${spec.label} profile.` };
  }
  const v = spec.fromText(text.replace(/\/+$/, ""));
  return v ? { ok: true, value: v } : { ok: false, error: `That doesn't look like a ${spec.label} ${key === "spotify" ? "artist link" : "handle"}.` };
}

/** The https link for a stored value (also tolerates legacy values saved before normalization). */
export function socialHref(key: string, stored: string): string | null {
  if (!(SOCIAL_KEYS as readonly string[]).includes(key)) return null;
  const k = key as SocialKey;
  const direct = SOCIAL[k].href(stored);
  if (direct) return direct;
  const n = normalizeSocial(k, stored);
  return n.ok && n.value ? SOCIAL[k].href(n.value) : null;
}

/** Social links in display order, dropping anything that doesn't resolve to a valid link. */
export function socialList(links: Record<string, string> | null | undefined) {
  const out: { key: SocialKey; label: string; href: string; handle: string }[] = [];
  for (const key of SOCIAL_KEYS) {
    const v = links?.[key];
    if (!v) continue;
    const href = socialHref(key, v);
    if (!href) continue;
    const norm = normalizeSocial(key, v);
    out.push({ key, label: SOCIAL[key].label, href, handle: SOCIAL[key].display(norm.ok && norm.value ? norm.value : v) });
  }
  return out;
}

/* ───────────────────────────── Embedded posts ───────────────────────────── */

export const EMBED_PROVIDERS = ["youtube", "tiktok", "instagram", "vimeo", "soundcloud", "spotify"] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];
export const EMBED_KINDS = ["video", "short", "post", "reel", "track", "album", "artist", "playlist", "episode", "show"] as const;
export type EmbedKind = (typeof EMBED_KINDS)[number];
export const MAX_EMBEDS = 24;

export const PROVIDER_LABEL: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  vimeo: "Vimeo",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
};

export const KIND_LABEL: Record<EmbedKind, string> = {
  video: "Video",
  short: "Short",
  post: "Post",
  reel: "Reel",
  track: "Track",
  album: "Album",
  artist: "Artist",
  playlist: "Playlist",
  episode: "Episode",
  show: "Podcast",
};

export type ParsedEmbed = { provider: EmbedProvider; kind: EmbedKind; providerId: string; url: string };
export type EmbedResult = { ok: true; embed: ParsedEmbed } | { ok: false; error: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TT_ID = /^\d{15,22}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,40}$/;
const VIMEO_ID = /^\d{5,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;
const SC_SLUG = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const SPOTIFY_KINDS = ["track", "album", "artist", "playlist", "episode", "show"] as const;

const HOSTS: Record<EmbedProvider, string[]> = {
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"],
  tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
  instagram: ["instagram.com", "www.instagram.com"],
  vimeo: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
  soundcloud: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"],
  spotify: ["open.spotify.com"],
};
const SHORT_LINK_HOSTS = ["vm.tiktok.com", "vt.tiktok.com", "on.soundcloud.com", "spotify.link", "instagr.am", "fb.watch"];
const SUPPORTED = "Paste a link to a YouTube, TikTok, Instagram, Vimeo, SoundCloud or Spotify post.";

function providerFor(host: string): EmbedProvider | null {
  for (const p of EMBED_PROVIDERS) if (HOSTS[p].includes(host)) return p;
  return null;
}

/** Strict parser: only canonical hosts and known path shapes; returns the parts we rebuild every URL from. */
export function parseEmbedUrl(raw: string): EmbedResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: SUPPORTED };
  const spotifyUri = /^spotify:(track|album|artist|playlist|episode|show):([A-Za-z0-9]{22})$/.exec(text);
  if (spotifyUri) return build("spotify", spotifyUri[1] as EmbedKind, spotifyUri[2]);
  if (text.length > 500) return { ok: false, error: "That link is too long." };
  const u = looseUrl(text);
  if (!u) return { ok: false, error: SUPPORTED };
  const host = u.hostname.toLowerCase();
  if (SHORT_LINK_HOSTS.includes(host)) return { ok: false, error: "Short links can't be checked. Open it, then copy the full address from your browser." };
  const provider = providerFor(host);
  if (!provider) return { ok: false, error: SUPPORTED };
  const segs = segmentsOf(u);
  const bad = (what: string): EmbedResult => ({ ok: false, error: `That ${PROVIDER_LABEL[provider]} link doesn't point to ${what}.` });

  switch (provider) {
    case "youtube": {
      if (host === "youtu.be") return YT_ID.test(segs[0] ?? "") ? build("youtube", "video", segs[0]) : bad("a video");
      const v = u.searchParams.get("v");
      if (segs[0] === "watch" && v && YT_ID.test(v)) return build("youtube", "video", v);
      if (segs[0] === "shorts" && YT_ID.test(segs[1] ?? "")) return build("youtube", "short", segs[1]);
      if ((segs[0] === "embed" || segs[0] === "live" || segs[0] === "v") && YT_ID.test(segs[1] ?? "")) return build("youtube", "video", segs[1]);
      return bad("a video");
    }
    case "tiktok": {
      const [user, kind, id] = segs;
      if (user?.startsWith("@") && TT_USER.test(user.slice(1)) && kind === "video" && TT_ID.test(id ?? "")) return build("tiktok", "video", id, user.slice(1));
      return bad("a video");
    }
    case "instagram": {
      const rest = segs[0] && ["p", "reel", "reels", "tv"].includes(segs[0]) ? segs : segs.slice(1);
      const [kind, code] = rest;
      if (!kind || !code || !IG_CODE.test(code)) return bad("a post or reel");
      if (kind === "p" || kind === "tv") return build("instagram", "post", code);
      if (kind === "reel" || kind === "reels") return build("instagram", "reel", code);
      return bad("a post or reel");
    }
    case "vimeo": {
      let id: string | undefined;
      let hash: string | undefined;
      if (host === "player.vimeo.com") {
        if (segs[0] === "video") id = segs[1];
        hash = u.searchParams.get("h") ?? undefined;
      } else {
        const i = segs.findIndex((s) => VIMEO_ID.test(s));
        // vimeo.com/123, /channels/x/123, /groups/x/videos/123, /showcase/x/video/123 — the id is the first all-digit segment.
        if (i >= 0 && (i === 0 || ["channels", "groups", "showcase", "album"].includes(segs[0]))) {
          id = segs[i];
          hash = segs[i + 1];
        }
      }
      if (!id || !VIMEO_ID.test(id)) return bad("a video");
      return build("vimeo", "video", hash && VIMEO_HASH.test(hash) ? `${id}:${hash}` : id);
    }
    case "soundcloud": {
      const [user, a, b] = segs.map((s) => s.toLowerCase());
      if (!user || SC_RESERVED.has(user) || !SC_SLUG.test(user)) return bad("a track or playlist");
      if (a === "sets" && b && SC_SLUG.test(b) && segs.length === 3) return build("soundcloud", "playlist", `${user}/sets/${b}`);
      if (a && a !== "sets" && SC_SLUG.test(a) && segs.length === 2 && !["tracks", "albums", "reposts", "likes", "followers", "following", "popular-tracks", "comments", "spotlight"].includes(a))
        return build("soundcloud", "track", `${user}/${a}`);
      return bad("a track or playlist");
    }
    case "spotify": {
      const rest = segs[0]?.startsWith("intl-") ? segs.slice(1) : segs;
      const p = rest[0] === "embed" ? rest.slice(1) : rest;
      const [kind, id] = p;
      if ((SPOTIFY_KINDS as readonly string[]).includes(kind ?? "") && SPOTIFY_ID.test(id ?? "")) return build("spotify", kind as EmbedKind, id);
      return bad("a track, album, artist or playlist");
    }
  }
}

function build(provider: EmbedProvider, kind: EmbedKind, providerId: string, extra?: string): EmbedResult {
  const url = canonicalUrl(provider, kind, providerId, extra);
  if (!url) return { ok: false, error: SUPPORTED };
  return { ok: true, embed: { provider, kind, providerId, url } };
}

/** Is this stored (provider, kind, id) triple well-formed? Used before rendering anything from the database. */
export function isValidEmbed(provider: string, kind: string, id: string): provider is EmbedProvider {
  switch (provider) {
    case "youtube":
      return (kind === "video" || kind === "short") && YT_ID.test(id);
    case "tiktok":
      return kind === "video" && TT_ID.test(id);
    case "instagram":
      return (kind === "post" || kind === "reel") && IG_CODE.test(id);
    case "vimeo": {
      const [vid, hash] = id.split(":");
      return kind === "video" && VIMEO_ID.test(vid) && (hash === undefined || VIMEO_HASH.test(hash));
    }
    case "soundcloud": {
      const parts = id.split("/");
      if (kind === "track") return parts.length === 2 && parts.every((s) => SC_SLUG.test(s)) && !SC_RESERVED.has(parts[0]);
      if (kind === "playlist") return parts.length === 3 && parts[1] === "sets" && SC_SLUG.test(parts[0]) && SC_SLUG.test(parts[2]) && !SC_RESERVED.has(parts[0]);
      return false;
    }
    case "spotify":
      return (SPOTIFY_KINDS as readonly string[]).includes(kind) && SPOTIFY_ID.test(id);
    default:
      return false;
  }
}

function canonicalUrl(provider: EmbedProvider, kind: EmbedKind, id: string, tiktokUser?: string): string | null {
  if (!isValidEmbed(provider, kind, id)) return null;
  switch (provider) {
    case "youtube":
      return kind === "short" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
    case "tiktok":
      return tiktokUser && TT_USER.test(tiktokUser) ? `https://www.tiktok.com/@${tiktokUser}/video/${id}` : null;
    case "instagram":
      return `https://www.instagram.com/${kind === "reel" ? "reel" : "p"}/${id}/`;
    case "vimeo": {
      const [vid, hash] = id.split(":");
      return hash ? `https://vimeo.com/${vid}/${hash}` : `https://vimeo.com/${vid}`;
    }
    case "soundcloud":
      return `https://soundcloud.com/${id}`;
    case "spotify":
      return `https://open.spotify.com/${kind}/${id}`;
  }
}

export type EmbedShape = "landscape" | "portrait" | "audio";
export type EmbedFrame = { src: string; shape: EmbedShape; /** Fixed pixel height for audio players. */ height?: number; allow: string };

/**
 * The iframe for a stored embed, built only from the validated id. YouTube
 * goes through youtube-nocookie.com; every player starts because the visitor
 * clicked, so autoplay is requested where the provider supports it.
 */
export function embedFrame(provider: string, kind: string, id: string): EmbedFrame | null {
  if (!isValidEmbed(provider, kind, id)) return null;
  const video = "autoplay; encrypted-media; fullscreen; picture-in-picture";
  switch (provider) {
    case "youtube":
      return { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`, shape: kind === "short" ? "portrait" : "landscape", allow: video };
    case "tiktok":
      return { src: `https://www.tiktok.com/player/v1/${id}?autoplay=1&rel=0&description=1&music_info=1`, shape: "portrait", allow: video };
    case "instagram":
      return { src: `https://www.instagram.com/${kind === "reel" ? "reel" : "p"}/${id}/embed/`, shape: "portrait", allow: "autoplay; encrypted-media; fullscreen" };
    case "vimeo": {
      const [vid, hash] = id.split(":");
      return { src: `https://player.vimeo.com/video/${vid}?${hash ? `h=${hash}&` : ""}autoplay=1&dnt=1`, shape: "landscape", allow: video };
    }
    case "soundcloud":
      return {
        src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com/${id}`)}&auto_play=true&visual=false&show_comments=false&hide_related=true&show_reposts=false`,
        shape: "audio",
        height: kind === "playlist" ? 352 : 166,
        allow: "autoplay; encrypted-media",
      };
    case "spotify":
      return { src: `https://open.spotify.com/embed/${kind}/${id}`, shape: "audio", height: kind === "track" || kind === "episode" ? 152 : 352, allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" };
    default:
      return null;
  }
}

/** A thumbnail we can show without calling the provider's API (YouTube only). */
export function embedThumbnail(provider: string, kind: string, id: string): string | null {
  if (provider === "youtube" && isValidEmbed(provider, kind, id)) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return null;
}

/** The stored canonical link, only if it is https on that provider's own host. */
export function safeEmbedLink(provider: string, url: string): string | null {
  if (!(EMBED_PROVIDERS as readonly string[]).includes(provider)) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return HOSTS[provider as EmbedProvider].includes(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function embedShape(provider: string, kind: string): EmbedShape {
  if (provider === "spotify" || provider === "soundcloud") return "audio";
  if (provider === "tiktok" || provider === "instagram" || (provider === "youtube" && kind === "short")) return "portrait";
  return "landscape";
}
