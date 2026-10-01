/**
 * "Ask Kept" — a local, deterministic understanding of what someone wants.
 * Turns free text ("barbero mañana por la tarde cerca, menos de 40") into a
 * structured search or a navigation target. Pure and fast: runs on every
 * message, with or without the optional language-model layer.
 */
import { normalizeSearch } from "./slugs";

export type Lang = "en" | "es";
export type DayPart = "morning" | "afternoon" | "evening";

export type When = {
  /** ISO dates (business-agnostic local dates) to look at, in order. */
  dates: string[];
  part?: DayPart;
  /** Local minute of day the person asked for ("at 5" → 1020). */
  minute?: number;
  /** "after 5" / "después de las 5" and "before noon" bounds, local minutes. */
  after?: number;
  before?: number;
  label: { en: string; es: string };
};

export type SearchIntent = {
  kind: "search";
  category?: string;
  /** Words worth matching against service names ("fade", "gel"). */
  terms: string[];
  when?: When;
  maxPriceCents?: number;
  nearMe: boolean;
  city?: string;
  mobile?: boolean;
  virtual?: boolean;
  sort?: "rating" | "price" | "distance";
};

export type NavTarget = "bookings" | "cancel" | "reschedule" | "messages" | "favorites" | "account" | "support" | "become_pro" | "notifications" | "dashboard" | "explore";
export type NavIntent = { kind: "navigate"; target: NavTarget };
export type Intent = SearchIntent | NavIntent | { kind: "greeting" } | { kind: "thanks" } | { kind: "help" } | { kind: "unknown" };

/* ───────────────────────── Lexicon ───────────────────────── */

/** Phrases (already normalized: no accents, lowercase) → category slug. Longest match wins. */
const CATEGORY_PHRASES: Record<string, string[]> = {
  barber: ["barber", "barbers", "barbershop", "barbero", "barberos", "barberia", "fade", "taper", "lineup", "line up", "beard", "barba", "afeitado", "shave", "desvanecido", "corte de barba", "skin fade"],
  "hair-salon": ["hair salon", "salon", "stylist", "hairstylist", "haircut", "hair cut", "corte de pelo", "corte de cabello", "cortarme el pelo", "peluqueria", "peluquero", "peluquera", "estilista", "tinte", "mechas", "balayage", "highlights", "color", "colour", "blowout", "peinado", "alisado", "keratina"],
  "braids-locs": ["braids", "braid", "knotless", "locs", "dreadlocks", "retwist", "cornrows", "trenzas", "rastas"],
  hair: ["hair", "pelo", "cabello"],
  nails: ["nails", "nail", "manicure", "mani", "pedicure", "pedi", "acrylic", "acrylics", "gel nails", "nail art", "unas", "manicura", "pedicura", "acrilicas", "unas acrilicas", "unas de gel"],
  "lashes-brows": ["lashes", "lash", "lash extensions", "lash lift", "brows", "brow", "eyebrows", "microblading", "threading", "pestanas", "cejas", "extensiones de pestanas", "laminado de cejas"],
  makeup: ["makeup", "make up", "makeup artist", "mua", "glam", "bridal makeup", "maquillaje", "maquillista", "maquilladora"],
  skincare: ["facial", "facials", "skincare", "skin care", "esthetician", "waxing", "wax", "peel", "limpieza facial", "depilacion", "cera", "cosmetologa"],
  beauty: ["beauty", "belleza"],
  massage: ["massage", "masseuse", "masseur", "deep tissue", "swedish", "sports massage", "masaje", "masajes", "masajista", "descontracturante", "relajante"],
  spa: ["spa", "sauna", "body treatment"],
  wellness: ["wellness", "relax", "relaxation", "bienestar"],
  "personal-training": ["personal trainer", "trainer", "training", "workout", "strength", "weight loss", "hiit", "entrenador", "entrenadora", "entrenador personal", "entrenamiento", "ejercicio", "bajar de peso", "gimnasio", "gym"],
  "yoga-pilates": ["yoga", "pilates", "reformer", "vinyasa", "meditation", "meditacion"],
  fitness: ["fitness", "fit"],
  education: ["tutor", "tutoring", "lessons", "lesson", "class", "classes", "teacher", "math", "piano", "guitar", "language", "sat", "clases", "clase", "profesor", "profesora", "maestro", "maestra", "matematicas", "ingles", "guitarra", "idiomas", "tutoria", "tareas"],
  photography: ["photographer", "photography", "photoshoot", "photo shoot", "headshots", "headshot", "videographer", "portraits", "fotografo", "fotografa", "fotos", "sesion de fotos", "fotografia", "video", "retratos"],
  "tattoo-piercing": ["tattoo", "tattoos", "piercing", "piercings", "fine line", "tatuaje", "tatuajes", "tatuador", "perforacion"],
  "home-services": ["home services", "servicios del hogar", "hogar"],
  cleaning: ["cleaning", "cleaner", "house cleaning", "deep clean", "limpieza", "limpieza de casa", "limpieza profunda"],
  handyman: ["handyman", "repair", "repairs", "plumber", "electrician", "assembly", "painter", "plomero", "fontanero", "electricista", "reparacion", "arreglos", "pintor", "manitas"],
  gardening: ["gardener", "gardening", "landscaping", "lawn", "yard work", "jardinero", "jardineria", "jardin", "cesped", "paisajismo"],
  "music-production": ["producer", "music producer", "beat", "beats", "beatmaker", "mixing", "mastering", "productor", "productor musical", "productores", "mezcla", "masterizacion", "instrumental"],
  "recording-studio": ["recording studio", "studio time", "recording", "vocal booth", "rehearsal", "estudio de grabacion", "grabar", "grabacion", "sala de ensayo", "estudio de musica"],
  "vocal-coaching": ["vocal coach", "singing lessons", "singing", "voice lessons", "clases de canto", "canto", "coach vocal"],
  "music-audio": ["music", "musica", "audio"],
  "content-creation": ["content creator", "ugc", "influencer", "brand content", "creador de contenido", "creadora de contenido"],
  "video-editing": ["video editor", "video editing", "editor de video", "edicion de video"],
  "social-media": ["social media", "social media manager", "community manager", "redes sociales", "manejo de redes"],
  creators: ["creator", "creators", "creadores"],
  "graphic-design": ["graphic designer", "graphic design", "logo", "branding", "flyer", "disenador grafico", "disenadora grafica", "diseno grafico", "logotipo"],
  "web-design": ["web designer", "web design", "website", "landing page", "pagina web", "sitio web", "diseno web", "disenador web"],
  "interior-design": ["interior designer", "interior design", "decor", "home staging", "interiorista", "diseno de interiores", "decoracion"],
  design: ["designer", "design", "diseno", "disenador", "disenadora"],
  physio: ["physio", "physiotherapy", "physical therapy", "physiotherapist", "chiropractor", "rehab", "fisio", "fisioterapia", "fisioterapeuta", "quiropractico", "rehabilitacion"],
  nutrition: ["nutritionist", "dietitian", "nutrition", "meal plan", "nutricionista", "nutriologo", "dietista", "nutricion", "plan de alimentacion"],
  therapy: ["therapist", "therapy", "counselor", "counseling", "psychologist", "terapeuta", "terapia", "psicologo", "psicologa", "consejero"],
  health: ["health", "salud"],
  automotive: ["car detailing", "detailing", "detail", "detailer", "car wash", "ceramic coating", "mechanic", "lavado de carro", "lavado de auto", "lavado de coche", "detallado", "mecanico", "carro", "auto", "coche"],
  pets: ["dog grooming", "groomer", "grooming", "pet sitter", "dog walker", "dog training", "perro", "perros", "mascota", "mascotas", "peluqueria canina", "paseador", "paseador de perros", "adiestrador"],
  events: ["dj", "event planner", "party", "wedding", "events", "fiesta", "boda", "evento", "eventos", "quinceanera"],
  professional: ["consultant", "coach", "advisor", "career coaching", "accountant", "consultor", "asesor", "contador", "coaching"],
};

const PHRASE_INDEX: [string, string][] = Object.entries(CATEGORY_PHRASES)
  .flatMap(([slug, phrases]) => phrases.map((p) => [p, slug] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

const NAV: [RegExp, NavTarget][] = [
  [/\b(cancel(ar)?|anular)\b.*\b(cita|reserva|appointment|booking)/, "cancel"],
  [/\b(reschedul\w*|reprogramar|cambiar|mover|move)\b.*\b(cita|reserva|appointment|booking|hora)/, "reschedule"],
  [/\b(my|mis|mi)\s+(bookings?|appointments?|citas?|reservas?|reservaciones?)\b|\b(upcoming|proximas?) (citas?|appointments?)\b/, "bookings"],
  [/\b(messages?|mensajes?|inbox|chat|bandeja)\b/, "messages"],
  [/\b(favorit\w*|saved|guardad\w*)\b/, "favorites"],
  [/\b(notificaci\w*|notifications?|alerts?|alertas?)\b/, "notifications"],
  [/\b(my account|mi cuenta|mi perfil|my profile|password|contrasena|settings|configuracion|ajustes|delete my account|borrar mi cuenta)\b/, "account"],
  [/\b(help|ayuda|support|soporte|problem\w*|problema|refund|reembolso|reclamo|complaint|queja)\b/, "support"],
  [/\b(offer|ofrecer|list|registrar|publicar|promocionar|vender|sell)\b.*\b(services?|servicios?|business|negocio|my work|mi trabajo)\b|\b(become a pro|soy (barbero|estilista|profesional|entrenador)|i('| a)m a (barber|stylist|trainer|pro))\b/, "become_pro"],
  [/\b(dashboard|panel|my business|mi negocio|mi calendario|my calendar)\b/, "dashboard"],
  [/\b(explore|explorar|browse|ver todo|see all|everything)\b/, "explore"],
];

const STOP = new Set(
  "i im i'm want wanna need looking for find search show me a an the some any to get book booking appointment with near nearby me my please pls who can do for at in on by of and or is are there one someone somebody good best cheap great top rated rating price prices under below less than max budget around about this next today tomorrow tonight morning afternoon evening night weekend week day pm am o clock que quiero necesito busco buscar encontrar muestrame mostrar un una unos unas el la los las de del para por con cerca mi me alguien bueno buena buenos buenas mejor mejores barato barata baratos economico precio menos que maximo hasta hoy manana tarde noche fin semana esta este proxima proximo semana cita reservar hacer en a las al y o hay hi hello hey hola buenas buenos dias thanks thank you gracias thx what can do how does this work como funciona puedes ayudame help".split(
    " ",
  ),
);

/* ───────────────────────── Parsing ───────────────────────── */

const WEEKDAYS: Record<string, number> = {
  monday: 1, lunes: 1, tuesday: 2, martes: 2, wednesday: 3, miercoles: 3, thursday: 4, jueves: 4, friday: 5, viernes: 5, saturday: 6, sabado: 6, sunday: 7, domingo: 7,
};

const SPANISH_HINTS = /\b(quiero|necesito|busco|para|cerca|manana|tarde|noche|hoy|una?|el|la|los|las|de|con|mis?|citas?|barbero|unas|masaje|corte|pelo|clases?|donde|cuanto|precio|ayuda|gracias|hola|buenas?)\b/;

export function detectLang(text: string): Lang {
  const n = normalizeSearch(text);
  if (/[ñ¿¡áéíóú]/i.test(text)) return "es";
  return SPANISH_HINTS.test(n) ? "es" : "en";
}

function isoAdd(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function isoWeekday(iso: string) {
  return ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** Parses time expressions relative to `today` (the viewer's local ISO date). */
export function parseWhen(n: string, today: string): When | undefined {
  let dates: string[] | undefined;
  let label = { en: "", es: "" };
  // Spanish "mañana" is both "tomorrow" and "morning": "por/en la mañana" is the part of day.
  const morningEs = /\b(por|en) la manana\b|\bde manana\b(?! (a|por|en))/.test(n) && !/\bmanana (por|en) la manana\b/.test(n) ? /\b(por|en) la manana\b/.test(n) : /\bmanana (por|en) la manana\b/.test(n);
  const tomorrowEs = /\bmanana\b/.test(n.replace(/\b(por|en) la manana\b/g, ""));
  if (/\b(today|tonight|hoy|esta noche|esta tarde|now|ahora|asap|lo antes posible)\b/.test(n)) {
    dates = [today];
    label = { en: "today", es: "hoy" };
  } else if (/\b(tomorrow|tmrw|tmr)\b/.test(n) || tomorrowEs || /\bpasado manana\b/.test(n)) {
    const plus = /\bpasado manana\b|\bday after tomorrow\b/.test(n) ? 2 : 1;
    dates = [isoAdd(today, plus)];
    label = plus === 2 ? { en: "the day after tomorrow", es: "pasado mañana" } : { en: "tomorrow", es: "mañana" };
  } else if (/\b(this weekend|weekend|fin de semana|finde)\b/.test(n)) {
    const wd = isoWeekday(today);
    const sat = isoAdd(today, wd === 7 ? -1 : 6 - wd);
    dates = wd === 7 ? [today] : wd === 6 ? [today, isoAdd(today, 1)] : [sat, isoAdd(sat, 1)];
    label = { en: "this weekend", es: "este fin de semana" };
  } else if (/\b(this week|esta semana)\b/.test(n)) {
    const wd = isoWeekday(today);
    dates = Array.from({ length: 8 - wd }, (_, i) => isoAdd(today, i));
    label = { en: "this week", es: "esta semana" };
  } else if (/\b(next week|proxima semana|la semana que viene)\b/.test(n)) {
    const wd = isoWeekday(today);
    const mon = isoAdd(today, 8 - wd);
    dates = Array.from({ length: 7 }, (_, i) => isoAdd(mon, i));
    label = { en: "next week", es: "la próxima semana" };
  } else {
    for (const [word, wd] of Object.entries(WEEKDAYS)) {
      if (new RegExp(`\\b${word}\\b`).test(n)) {
        const diff = (wd - isoWeekday(today) + 7) % 7 || (new RegExp(`\\bnext ${word}\\b|\\b${word} (que viene|proximo)\\b`).test(n) ? 7 : 0);
        dates = [isoAdd(today, diff)];
        const names = Object.entries(WEEKDAYS).filter(([, v]) => v === wd).map(([k]) => k);
        label = { en: diff === 0 ? "today" : names[0][0].toUpperCase() + names[0].slice(1), es: diff === 0 ? "hoy" : `el ${names[1]}`.replace("miercoles", "miércoles").replace("sabado", "sábado") };
        break;
      }
    }
  }

  let part: DayPart | undefined;
  if (/\b(morning|mornings|early)\b/.test(n) || morningEs) part = "morning";
  else if (/\b(afternoon|after lunch|tarde|por la tarde|lunchtime|mediodia|lunch)\b/.test(n)) part = "afternoon";
  else if (/\b(evening|tonight|night|after work|noche|despues del trabajo|esta noche)\b/.test(n)) part = "evening";

  const hourOf = (h: string, ap?: string) => {
    let v = Number(h);
    if (ap?.startsWith("p") && v < 12) v += 12;
    if (ap?.startsWith("a") && v === 12) v = 0;
    if (!ap && v >= 1 && v <= 7) v += 12;
    return v * 60;
  };
  let after: number | undefined;
  let before: number | undefined;
  const af = /\b(?:after|from|despues de las?|desde las?|a partir de las?)\s*(\d{1,2})\s*(am|pm)?\b/.exec(n);
  if (af) after = hourOf(af[1], af[2]);
  const bf = /\b(?:before|antes de las?)\s*(\d{1,2})\s*(am|pm)?\b/.exec(n);
  if (bf) before = hourOf(bf[1], bf[2]);
  if (/\b(after work|despues del trabajo)\b/.test(n)) after ??= 17 * 60;
  if (/\b(before noon|antes del mediodia)\b/.test(n)) before ??= 12 * 60;

  let minute: number | undefined;
  // Text is normalized, so "6:30" arrives as "6 30".
  const t = /\b(?:at|a las?|@)\s*(\d{1,2})(?:[: ]([0-5]\d))?\s*(am|pm|a m|p m)?\b/.exec(n) ?? /\b(\d{1,2})(?:[: ]([0-5]\d))?\s*(am|pm)\b/.exec(n);
  if (t && !af && !bf) {
    let h = Number(t[1]);
    const m = Number(t[2] ?? 0);
    const ap = (t[3] ?? "").replace(/\s/g, "");
    if (h <= 24 && m < 60) {
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      // "a las 5" with no am/pm: people mean business hours.
      if (!ap && h >= 1 && h <= 7) h += part === "morning" ? 0 : 12;
      minute = h * 60 + m;
    }
  }

  if (!dates && !part && minute == null && after == null && before == null) return undefined;
  if (!dates) {
    dates = [today, isoAdd(today, 1), isoAdd(today, 2)];
    label = { en: "in the next few days", es: "en los próximos días" };
  }
  const partLabel = part ? { en: { morning: "morning", afternoon: "afternoon", evening: "evening" }[part], es: { morning: "por la mañana", afternoon: "por la tarde", evening: "por la noche" }[part] } : null;
  if (partLabel) label = { en: `${label.en} ${label.en === "today" ? "this " : ""}${partLabel.en}`.replace("today this", "this").trim(), es: `${label.es} ${partLabel.es}`.trim() };
  if (minute != null) {
    const hh = Math.floor(minute / 60);
    const mm = minute % 60;
    const clock = `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`;
    label = { en: `${label.en} around ${clock}`, es: `${label.es} cerca de las ${clock}` };
  }
  const clockOf = (mins: number) => `${Math.floor(mins / 60) % 12 || 12}${mins % 60 ? `:${String(mins % 60).padStart(2, "0")}` : ""} ${mins < 720 ? "AM" : "PM"}`;
  if (after != null) label = { en: `${label.en} after ${clockOf(after)}`, es: `${label.es} después de las ${clockOf(after)}` };
  if (before != null) label = { en: `${label.en} before ${clockOf(before)}`, es: `${label.es} antes de las ${clockOf(before)}` };
  return { dates, part, minute, after, before, label };
}

/** Does a local minute-of-day satisfy the requested part/time? */
export function matchesWhen(localMinute: number, when: Pick<When, "part" | "minute" | "after" | "before">): boolean {
  if (when.after != null && localMinute < when.after) return false;
  if (when.before != null && localMinute >= when.before) return false;
  if (when.after != null || when.before != null) return true;
  if (when.minute != null) return Math.abs(localMinute - when.minute) <= 90;
  if (when.part === "morning") return localMinute < 12 * 60;
  if (when.part === "afternoon") return localMinute >= 12 * 60 && localMinute < 17 * 60;
  if (when.part === "evening") return localMinute >= 17 * 60;
  return true;
}

export function parseRequest(text: string, today: string): { intent: Intent; lang: Lang } {
  const lang = detectLang(text);
  const n = normalizeSearch(text);
  if (!n) return { intent: { kind: "unknown" }, lang };

  for (const [re, target] of NAV) if (re.test(n)) return { intent: { kind: "navigate", target }, lang };

  let rest = ` ${n} `;
  let category: string | undefined;
  const matched: string[] = [];
  for (const [phrase, slug] of PHRASE_INDEX) {
    if (rest.includes(` ${phrase} `)) {
      category ??= slug;
      matched.push(phrase);
      rest = rest.replace(` ${phrase} `, " ");
    }
  }

  const when = parseWhen(n, today);
  let maxPriceCents: number | undefined;
  const price = /\b(?:under|below|less than|max|maximum|up to|no more than|menos de|por debajo de|maximo|hasta|no mas de)\s*\$?\s*(\d{1,5})\b/.exec(n) ?? /\$\s?(\d{1,5})\b/.exec(text.toLowerCase());
  if (price) maxPriceCents = Number(price[1]) * 100;

  const sort: SearchIntent["sort"] = /\b(best|top|highest rated|top rated|highly rated|mejor|mejores|mejor valorad\w*|recomendad\w*)\b/.test(n)
    ? "rating"
    : /\b(cheap|cheapest|affordable|budget|barat\w*|economic\w*|accesible)\b/.test(n)
      ? "price"
      : /\b(closest|nearest|mas cerca|mas cercan\w*)\b/.test(n)
        ? "distance"
        : undefined;
  const nearMe = /\b(near me|nearby|close to me|around me|closest|nearest|cerca|cercano|cercanos|por aqui|mi zona)\b/.test(n);
  const mobile = /\b(at home|come to me|comes to me|house call|mobile|at my place|a domicilio|a mi casa|domicilio|que venga)\b/.test(n) || undefined;
  const virtual = /\b(online|virtual|zoom|remote|remoto|en linea|por video)\b/.test(n) || undefined;
  const city = /\b(?:in|en)\s+([a-z][a-z ]{2,30}?)(?=\s+(?:for|para|under|menos|tomorrow|manana|today|hoy|this|esta|at|a las|near|cerca)\b|$)/.exec(n)?.[1]?.trim();

  // Matched phrases stay useful for picking the right service ("skin fade", "retratos").
  const terms = [...new Set([...rest.split(" "), ...matched.flatMap((p) => p.split(" "))])].filter(
    (w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w) && !(w in WEEKDAYS) && w !== city,
  );

  if (!category && terms.length === 0 && !when && !maxPriceCents && !nearMe && !mobile && !virtual) {
    if (/^(hi|hello|hey|hola|buenas|buenos dias|buenas tardes|buenas noches|que tal)\b/.test(n)) return { intent: { kind: "greeting" }, lang };
    if (/\b(thanks|thank you|gracias|thx)\b/.test(n)) return { intent: { kind: "thanks" }, lang };
    if (/\b(what can you do|how does this work|como funciona|que puedes hacer|help me|ayudame)\b/.test(n)) return { intent: { kind: "help" }, lang };
    return { intent: { kind: "unknown" }, lang };
  }

  return {
    intent: { kind: "search", category, terms: terms.slice(0, 6), when, maxPriceCents, nearMe, city: city && !CITY_STOP.has(city) ? city : undefined, mobile, virtual, sort: sort ?? (nearMe ? "distance" : undefined) },
    lang,
  };
}

const CITY_STOP = new Set(["the morning", "the afternoon", "the evening", "la manana", "la tarde", "la noche", "linea", "line", "person", "persona"]);

/** How a category reads inside a sentence ("Here are 3 barbers…"). */
export const CATEGORY_LABELS: Record<string, { en: string; es: string }> = {
  barber: { en: "barbers", es: "barbería" },
  "hair-salon": { en: "hair stylists", es: "peluquería" },
  "braids-locs": { en: "braid & loc specialists", es: "trenzas y locs" },
  hair: { en: "hair professionals", es: "cabello" },
  nails: { en: "nail artists", es: "uñas" },
  "lashes-brows": { en: "lash & brow artists", es: "pestañas y cejas" },
  makeup: { en: "makeup artists", es: "maquillaje" },
  skincare: { en: "skincare specialists", es: "cuidado de la piel" },
  beauty: { en: "beauty professionals", es: "belleza" },
  massage: { en: "massage therapists", es: "masajes" },
  spa: { en: "spas", es: "spa" },
  wellness: { en: "wellness professionals", es: "bienestar" },
  "personal-training": { en: "personal trainers", es: "entrenadores personales" },
  "yoga-pilates": { en: "yoga & pilates teachers", es: "yoga y pilates" },
  fitness: { en: "fitness coaches", es: "fitness" },
  education: { en: "tutors & teachers", es: "clases y tutorías" },
  photography: { en: "photographers", es: "fotografía" },
  "tattoo-piercing": { en: "tattoo & piercing artists", es: "tatuajes y piercing" },
  "home-services": { en: "home service pros", es: "servicios del hogar" },
  automotive: { en: "detailers & mechanics", es: "autos" },
  pets: { en: "pet care pros", es: "mascotas" },
  events: { en: "event pros", es: "eventos" },
  professional: { en: "consultants & coaches", es: "asesoría" },
};

/** A follow-up like "and Saturday?" keeps what was asked before. */
export function mergeFollowUp(current: SearchIntent, previousTexts: string[], today: string): SearchIntent {
  if (current.category || current.terms.length) return current;
  for (const text of [...previousTexts].reverse()) {
    const prev = parseRequest(text, today).intent;
    if (prev.kind === "search" && (prev.category || prev.terms.length)) {
      return {
        ...prev,
        when: current.when ?? prev.when,
        maxPriceCents: current.maxPriceCents ?? prev.maxPriceCents,
        nearMe: current.nearMe || prev.nearMe,
        mobile: current.mobile ?? prev.mobile,
        virtual: current.virtual ?? prev.virtual,
        sort: current.sort ?? prev.sort,
        city: current.city ?? prev.city,
      };
    }
  }
  return current;
}
