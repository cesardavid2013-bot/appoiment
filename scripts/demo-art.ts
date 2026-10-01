/**
 * Editorial stand-in imagery for the demo businesses (development only).
 *
 * There are no stock photos in the repository and none are downloaded: every
 * image is drawn here — still-life scenes with a key light, soft cast shadows,
 * haze and film grain — so demo profiles read like a real portfolio until a
 * professional uploads their own work. Seeded, so results are repeatable.
 */
import sharp from "sharp";

export type Palette = {
  /** Wall / sky, light to deep */
  wall: [string, string];
  /** Floor or foreground */
  floor: [string, string];
  /** Main object colour, lit and shaded sides */
  object: [string, string];
  /** Accent used sparingly (a sun, a highlight, a rim) */
  accent: string;
  /** Direction of the key light: -1 from the left, 1 from the right */
  light: 1 | -1;
};

export const PALETTES = {
  ink: { wall: ["#3a342c", "#14120e"], floor: ["#201c17", "#0c0b09"], object: ["#e8dcc4", "#6d6150"], accent: "#c9a865", light: 1 },
  blush: { wall: ["#f3e3dc", "#d9b8ad"], floor: ["#e8cfc4", "#bf9a8d"], object: ["#fff7f2", "#d3a99c"], accent: "#b8645a", light: -1 },
  sage: { wall: ["#e6e8dc", "#b4bea5"], floor: ["#d9d2bf", "#a79f86"], object: ["#f5f1e4", "#8f9a7c"], accent: "#6b7a58", light: 1 },
  clay: { wall: ["#e3b99b", "#a2603f"], floor: ["#7a3f27", "#3d1e12"], object: ["#f6e2cc", "#a45c3a"], accent: "#2f4a3a", light: -1 },
  steel: { wall: ["#cfd8e0", "#6f7f8e"], floor: ["#3e4852", "#161b20"], object: ["#f2f6f9", "#7d8c99"], accent: "#d8b45a", light: 1 },
  film: { wall: ["#d8cfc0", "#8a7d68"], floor: ["#4a4034", "#1d1812"], object: ["#f3ead8", "#8d7c63"], accent: "#c4572f", light: -1 },
  navy: { wall: ["#9fb0c6", "#2a3a58"], floor: ["#1b2640", "#0a0f1c"], object: ["#f4efe3", "#6a7a98"], accent: "#e0b85c", light: 1 },
} satisfies Record<string, Palette>;

export type Scene = "arch" | "louvers" | "horizon" | "orbs" | "pillars" | "stones";

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

function defs(p: Palette, w: number, h: number) {
  return `<defs>
    <linearGradient id="wall" x1="0" y1="0" x2="${p.light === 1 ? 1 : 0}" y2="1"><stop offset="0" stop-color="${p.wall[0]}"/><stop offset="1" stop-color="${p.wall[1]}"/></linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.floor[0]}"/><stop offset="1" stop-color="${p.floor[1]}"/></linearGradient>
    <radialGradient id="sphere" cx="${p.light === 1 ? 0.34 : 0.66}" cy="0.3" r="0.85"><stop offset="0" stop-color="${p.object[0]}"/><stop offset="0.55" stop-color="${p.object[0]}" stop-opacity="0.9"/><stop offset="1" stop-color="${p.object[1]}"/></radialGradient>
    <linearGradient id="column" x1="${p.light === 1 ? 0 : 1}" y1="0" x2="${p.light === 1 ? 1 : 0}" y2="0"><stop offset="0" stop-color="${p.object[0]}"/><stop offset="1" stop-color="${p.object[1]}"/></linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.78"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient>
    <linearGradient id="lightwash" x1="${p.light === 1 ? 1 : 0}" y1="0" x2="${p.light === 1 ? 0 : 1}" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.34"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="b4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="b14" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="b40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
    <clipPath id="frame"><rect width="${w}" height="${h}"/></clipPath>
  </defs>`;
}

/** Soft elliptical shadow cast away from the light. */
function shadow(cx: number, cy: number, rx: number, ry: number, p: Palette, opacity = 0.42) {
  const dx = -p.light * rx * 0.55;
  return `<ellipse cx="${f(cx + dx)}" cy="${f(cy)}" rx="${f(rx * 1.35)}" ry="${f(ry)}" fill="#000" opacity="${opacity}" filter="url(#b14)"/>`;
}

function scene(kind: Scene, p: Palette, w: number, h: number, seed: number) {
  const r = rng(seed);
  const horizon = h * (0.6 + r() * 0.08);
  const L = p.light;
  let body = "";

  if (kind === "arch") {
    const aw = w * (0.3 + r() * 0.08);
    const ax = w * (0.5 + L * -0.1 + (r() - 0.5) * 0.08) - aw / 2;
    const ah = horizon * 0.86;
    body += `<rect width="${w}" height="${f(horizon)}" fill="url(#wall)"/><rect y="${f(horizon)}" width="${w}" height="${f(h - horizon)}" fill="url(#floor)"/>`;
    // The archway: a lit opening with a deeper interior.
    body += `<path d="M${f(ax)} ${f(horizon)} V${f(ah * 0.42)} A${f(aw / 2)} ${f(aw / 2)} 0 0 1 ${f(ax + aw)} ${f(ah * 0.42)} V${f(horizon)} Z" fill="${p.wall[1]}" opacity="0.55"/>`;
    body += `<path d="M${f(ax + aw * 0.08)} ${f(horizon)} V${f(ah * 0.44)} A${f(aw * 0.42)} ${f(aw * 0.42)} 0 0 1 ${f(ax + aw * 0.92)} ${f(ah * 0.44)} V${f(horizon)} Z" fill="${p.accent}" opacity="0.28"/>`;
    // Light spill from the arch onto the floor.
    body += `<polygon points="${f(ax + aw * 0.1)},${f(horizon)} ${f(ax + aw * 0.9)},${f(horizon)} ${f(ax + aw * 0.9 + L * -aw * 0.7)},${f(h)} ${f(ax + aw * 0.1 + L * -aw * 0.7)},${f(h)}" fill="${p.accent}" opacity="0.2" filter="url(#b14)"/>`;
    const px = ax + aw * (0.5 + L * 0.12);
    const pw = aw * 0.34;
    const ph = (h - horizon) * 0.42;
    body += shadow(px, horizon + (h - horizon) * 0.5, pw * 0.8, ph * 0.18, p);
    body += `<rect x="${f(px - pw / 2)}" y="${f(horizon + (h - horizon) * 0.12)}" width="${f(pw)}" height="${f(ph)}" rx="4" fill="url(#column)"/>`;
    body += `<ellipse cx="${f(px)}" cy="${f(horizon + (h - horizon) * 0.12)}" rx="${f(pw / 2)}" ry="${f(pw * 0.1)}" fill="${p.object[0]}"/>`;
    const sr = pw * 0.42;
    body += `<circle cx="${f(px)}" cy="${f(horizon + (h - horizon) * 0.12 - sr * 0.92)}" r="${f(sr)}" fill="url(#sphere)"/>`;
  }

  if (kind === "louvers") {
    body += `<rect width="${w}" height="${f(horizon)}" fill="url(#wall)"/><rect y="${f(horizon)}" width="${w}" height="${f(h - horizon)}" fill="url(#floor)"/>`;
    const bands = 6 + Math.floor(r() * 3);
    const slant = w * 0.28 * L;
    for (let i = 0; i < bands; i++) {
      const x0 = (w / bands) * i * 1.15 - w * 0.1;
      const bw = (w / bands) * (0.34 + r() * 0.2);
      body += `<polygon points="${f(x0)},0 ${f(x0 + bw)},0 ${f(x0 + bw - slant)},${f(h)} ${f(x0 - slant)},${f(h)}" fill="#fff" opacity="${f(0.1 + r() * 0.14)}" filter="url(#b4)"/>`;
    }
    const cx = w * (0.5 - L * 0.08);
    const cr = Math.min(w, h) * (0.17 + r() * 0.04);
    body += shadow(cx, horizon + cr * 0.55, cr, cr * 0.22, p, 0.5);
    body += `<circle cx="${f(cx)}" cy="${f(horizon - cr * 0.15)}" r="${f(cr)}" fill="url(#sphere)"/>`;
    body += `<circle cx="${f(cx + L * -cr * 0.82)}" cy="${f(horizon + cr * 0.2)}" r="${f(cr * 0.34)}" fill="url(#sphere)"/>`;
  }

  if (kind === "horizon") {
    const sky = horizon * 1.0;
    body += `<rect width="${w}" height="${f(sky)}" fill="url(#wall)"/>`;
    const sx = w * (0.5 + L * 0.16);
    const sy = sky * (0.5 + r() * 0.1);
    body += `<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(Math.min(w, h) * 0.34)}" fill="${p.accent}" opacity="0.32" filter="url(#b40)"/>`;
    body += `<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(Math.min(w, h) * 0.085)}" fill="${p.object[0]}"/>`;
    // Three layers of receding land, each lighter and hazier than the last.
    for (let i = 0; i < 3; i++) {
      const top = sky - h * (0.07 + (2 - i) * 0.03) + r() * h * 0.03;
      const k = 1 - i * 0.28;
      const pts: string[] = [`0,${f(h)}`];
      for (let x = 0; x <= w; x += w / 14) pts.push(`${f(x)},${f(top + Math.sin(x / w * (3 + i) + seed + i) * h * 0.035 + (i === 2 ? h * 0.04 : 0))}`);
      pts.push(`${f(w)},${f(h)}`);
      body += `<polygon points="${pts.join(" ")}" fill="${i === 0 ? p.floor[1] : i === 1 ? p.floor[0] : p.object[1]}" opacity="${f(0.5 + k * 0.5)}"/>`;
    }
    body += `<rect y="${f(sky - h * 0.12)}" width="${w}" height="${f(h * 0.2)}" fill="#fff" opacity="0.1" filter="url(#b40)"/>`;
  }

  if (kind === "orbs") {
    body += `<rect width="${w}" height="${h}" fill="url(#wall)"/>`;
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const rr = Math.min(w, h) * (0.1 + r() * 0.22);
      const x = w * (0.1 + r() * 0.8);
      const y = h * (0.12 + r() * 0.76);
      const hue = i % 3 === 0 ? p.accent : i % 3 === 1 ? p.object[0] : p.object[1];
      body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="${hue}" opacity="${f(0.18 + r() * 0.3)}" filter="url(#${i % 2 ? "b14" : "b4"})"/>`;
      if (i % 3 === 0) body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="none" stroke="${p.object[0]}" stroke-width="1.5" opacity="0.4"/>`;
    }
    const hr = Math.min(w, h) * 0.2;
    body += `<circle cx="${f(w * 0.5 - L * w * 0.08)}" cy="${f(h * 0.52)}" r="${f(hr)}" fill="url(#sphere)"/>`;
    body += `<ellipse cx="${f(w * 0.5 - L * w * 0.08 - L * hr * 0.4)}" cy="${f(h * 0.52 + hr * 1.2)}" rx="${f(hr * 1.1)}" ry="${f(hr * 0.16)}" fill="#000" opacity="0.4" filter="url(#b14)"/>`;
  }

  if (kind === "pillars") {
    body += `<rect width="${w}" height="${f(horizon)}" fill="url(#wall)"/><rect y="${f(horizon)}" width="${w}" height="${f(h - horizon)}" fill="url(#floor)"/>`;
    const n = 4 + Math.floor(r() * 2);
    const gap = w / (n + 1);
    for (let i = 1; i <= n; i++) {
      const pw = gap * (0.34 + r() * 0.1);
      const ph = horizon * (0.52 + r() * 0.3);
      const x = gap * i - pw / 2;
      body += shadow(x + pw / 2, horizon + (h - horizon) * 0.18, pw * 0.7, (h - horizon) * 0.07, p, 0.4);
      body += `<rect x="${f(x)}" y="${f(horizon - ph)}" width="${f(pw)}" height="${f(ph + (h - horizon) * 0.1)}" rx="${f(pw / 2)}" fill="url(#column)"/>`;
    }
  }

  if (kind === "stones") {
    body += `<rect width="${w}" height="${f(horizon)}" fill="url(#wall)"/><rect y="${f(horizon)}" width="${w}" height="${f(h - horizon)}" fill="url(#floor)"/>`;
    const cx = w * (0.5 - L * 0.05);
    let y = horizon + (h - horizon) * 0.26;
    let rx = Math.min(w, h) * 0.2;
    body += shadow(cx, y + 6, rx * 1.1, rx * 0.2, p, 0.5);
    for (let i = 0; i < 4; i++) {
      const ry = rx * (0.34 + r() * 0.08);
      body += `<ellipse cx="${f(cx + (r() - 0.5) * rx * 0.2)}" cy="${f(y - ry * 0.7)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#sphere)"/>`;
      y -= ry * 1.45;
      rx *= 0.7 + r() * 0.06;
    }
    // Steam or mist rising from the stack.
    body += `<ellipse cx="${f(cx)}" cy="${f(y - h * 0.08)}" rx="${f(w * 0.12)}" ry="${f(h * 0.12)}" fill="#fff" opacity="0.14" filter="url(#b40)"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(p, w, h)}<g clip-path="url(#frame)">${body}<rect width="${w}" height="${h}" fill="url(#lightwash)"/><rect width="${w}" height="${h}" fill="url(#vignette)"/></g></svg>`;
}

/** Renders one scene to a JPEG with film grain and a gentle colour grade. */
export async function renderArt(kind: Scene, palette: Palette, w: number, h: number, seed: number): Promise<Buffer> {
  const base = await sharp(Buffer.from(scene(kind, palette, w, h, seed))).png().toBuffer();
  const grain = await sharp({ create: { width: w, height: h, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 26 } } })
    .blur(0.6)
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: grain, blend: "soft-light" }])
    .modulate({ saturation: 0.94, brightness: 1.0 })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
