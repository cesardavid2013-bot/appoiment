// Draws the app icons (PWA, iOS home screen, favicon) from the Kept mark. Usage: node scripts/make-icons.mjs
import sharp from "sharp";
import fs from "node:fs";

/** The mark: a brass ring with a check, on ink. `pad` is the safe-zone padding as a fraction of the canvas. */
const svg = (size, pad, round) => {
  const c = size / 2;
  const r = size * (0.5 - pad) * 0.9;
  const sw = size * 0.045;
  const k = r / 10; // check geometry is drawn on a 20-unit box
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="0.3" cy="0.2" r="1"><stop offset="0" stop-color="#26221b"/><stop offset="1" stop-color="#0e0d0b"/></radialGradient>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2c98c"/><stop offset="1" stop-color="#a8843e"/></linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${round ? size * 0.22 : 0}" fill="url(#g)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#b)" stroke-width="${sw}"/>
  <path d="M${c - 5.2 * k} ${c + 0.2 * k} L${c - 1.4 * k} ${c + 4.2 * k} L${c + 5.6 * k} ${c - 3.6 * k}" fill="none" stroke="url(#b)" stroke-width="${sw * 1.15}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
};

const out = [
  ["public/icons/icon-192.png", 192, 0.2, true],
  ["public/icons/icon-512.png", 512, 0.2, true],
  // Maskable icons get cropped by the OS: keep everything inside the central 80%.
  ["public/icons/maskable-512.png", 512, 0.3, false],
  ["public/icons/apple-touch-icon.png", 180, 0.2, false],
  ["src/app/icon.png", 512, 0.2, true],
  ["src/app/apple-icon.png", 180, 0.2, false],
];
for (const [file, size, pad, round] of out) {
  await sharp(Buffer.from(svg(size, pad, round))).png({ compressionLevel: 9 }).toFile(file);
  console.log("✓", file, `${Math.round(fs.statSync(file).size / 1024)}KB`);
}
