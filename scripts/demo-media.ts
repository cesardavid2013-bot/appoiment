// Adds photos and short videos to the demo businesses so profiles read like real portfolios.
// Development only. Idempotent: businesses that already have a cover are skipped (use --force to redo).
// Usage: npm run db:demo-media [-- --force]
import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq, isNull } from "drizzle-orm";
import { db, sqlClient } from "../src/server/db/client";
import { businesses, portfolioItems, services } from "../src/server/db/schema";
import { ingestUpload, processVideo } from "../src/server/services/media";
import { PALETTES, renderArt, type Palette, type Scene } from "./demo-art";

const run = promisify(execFile);

type Shot = { scene: Scene; caption: string; service?: string; w?: number; h?: number };
type Plan = { palette: keyof typeof PALETTES; cover: Scene; avatar: Scene; shots: Shot[]; videos?: { scene: Scene; caption: string; service?: string }[] };

const PLANS: Record<string, Plan> = {
  "north-fade-studio": {
    palette: "ink",
    cover: "louvers",
    avatar: "arch",
    shots: [
      { scene: "arch", caption: "Skin fade, blended into a soft top", service: "Skin fade" },
      { scene: "louvers", caption: "Signature cut and a clean neckline", service: "Signature cut" },
      { scene: "pillars", caption: "Hot towel shave, finished with balm", service: "Hot towel shave" },
      { scene: "orbs", caption: "Kids cut — first fade of the summer", service: "Kids cut (under 12)", w: 1200, h: 1200 },
      { scene: "stones", caption: "Lineup and beard sculpt", service: "Signature cut" },
    ],
    videos: [{ scene: "arch", caption: "Fade, start to finish", service: "Skin fade" }],
  },
  "studio-lune-nails": {
    palette: "blush",
    cover: "arch",
    avatar: "orbs",
    shots: [
      { scene: "arch", caption: "Structured gel in a milky nude", service: "Gel extensions" },
      { scene: "orbs", caption: "Hand-painted chrome, one nail at a time", service: "Gel extensions" },
      { scene: "stones", caption: "Almond set, soft French", service: "Gel extensions" },
      { scene: "louvers", caption: "Structured gel manicure, natural length", service: "Structured gel manicure", w: 1200, h: 1200 },
    ],
  },
  "maya-okafor-pt": {
    palette: "clay",
    cover: "horizon",
    avatar: "stones",
    shots: [
      { scene: "horizon", caption: "Sunrise strength sessions", service: "1:1 strength session" },
      { scene: "pillars", caption: "Barbell basics — form first", service: "1:1 strength session" },
      { scene: "louvers", caption: "Intro consultation: we plan your first 8 weeks", service: "Intro consultation", w: 1200, h: 1200 },
    ],
    videos: [{ scene: "horizon", caption: "A morning session", service: "1:1 strength session" }],
  },
  "calm-hands-massage": {
    palette: "sage",
    cover: "stones",
    avatar: "stones",
    shots: [
      { scene: "stones", caption: "Deep tissue, unhurried", service: "Deep tissue massage" },
      { scene: "horizon", caption: "Sports recovery after long runs", service: "Sports recovery massage" },
      { scene: "arch", caption: "The treatment room", service: "Deep tissue massage", w: 1200, h: 1200 },
    ],
  },
  "shine-mobile-detailing": {
    palette: "steel",
    cover: "orbs",
    avatar: "orbs",
    shots: [
      { scene: "orbs", caption: "Full detail — paint corrected and sealed", service: "Full detail" },
      { scene: "louvers", caption: "Ceramic coating, cured and polished", service: "Full detail" },
      { scene: "horizon", caption: "Interior refresh at your door", service: "Interior refresh", w: 1200, h: 1200 },
    ],
  },
  "jo-park-photo": {
    palette: "film",
    cover: "pillars",
    avatar: "arch",
    shots: [
      { scene: "arch", caption: "Headshots in natural window light", service: "Headshot session" },
      { scene: "orbs", caption: "Evening portraits, golden hour", service: "Portrait session" },
      { scene: "horizon", caption: "Location portrait session", service: "Portrait session" },
      { scene: "louvers", caption: "Team headshots, same-day proofs", service: "Headshot session", w: 1200, h: 1200 },
    ],
    videos: [{ scene: "louvers", caption: "Behind the scenes", service: "Portrait session" }],
  },
  "ivy-learning": {
    palette: "navy",
    cover: "arch",
    avatar: "pillars",
    shots: [
      { scene: "pillars", caption: "SAT prep, small groups", service: "SAT prep" },
      { scene: "arch", caption: "Math tutoring, one-to-one", service: "Math tutoring" },
      { scene: "orbs", caption: "Homework help that sticks", service: "Math tutoring", w: 1200, h: 1200 },
    ],
  },
};

/** Slow push-in with a touch of grain: a 6-second clip made from one frame. */
async function clip(frame: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "kept-demo-"));
  try {
    const src = path.join(dir, "frame.jpg");
    const out = path.join(dir, "clip.mp4");
    await writeFile(src, frame);
    await run(
      "ffmpeg",
      ["-y", "-loop", "1", "-i", src, "-t", "6", "-vf", "scale=1600:-2,zoompan=z='1+0.0009*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=960x1200:fps=25,noise=alls=7:allf=t,fade=t=in:st=0:d=0.5,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-movflags", "+faststart", out],
      { timeout: 120_000 },
    );
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to add demo media in production.");
  const force = process.argv.includes("--force");
  let seed = 11;
  for (const [slug, plan] of Object.entries(PLANS)) {
    const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (!biz) continue;
    if (biz.coverMediaId && !force) {
      console.log(`· ${slug}: already has media`);
      continue;
    }
    const palette: Palette = PALETTES[plan.palette];
    const owner = biz.ownerUserId;
    const put = async (purpose: "cover" | "logo" | "portfolio", data: Buffer, alt: string) => (await ingestUpload({ ownerUserId: owner, businessId: biz.id, purpose, data, alt })).id;

    const cover = await put("cover", await renderArt(plan.cover, palette, 2400, 1000, seed++), `${biz.name}`);
    const logo = await put("logo", await renderArt(plan.avatar, palette, 600, 600, seed++), `${biz.name} logo`);
    await db.update(businesses).set({ coverMediaId: cover, logoMediaId: logo }).where(eq(businesses.id, biz.id));

    await db.update(portfolioItems).set({ deletedAt: new Date() }).where(and(eq(portfolioItems.businessId, biz.id), isNull(portfolioItems.deletedAt)));
    const svc = await db.select({ id: services.id, name: services.name }).from(services).where(eq(services.businessId, biz.id));
    const serviceId = (name?: string) => svc.find((s) => s.name === name)?.id ?? null;

    let order = 0;
    for (const s of plan.shots) {
      const mediaId = await put("portfolio", await renderArt(s.scene, palette, s.w ?? 1200, s.h ?? 1500, seed++), s.caption);
      await db.insert(portfolioItems).values({ businessId: biz.id, kind: "image", mediaId, caption: s.caption, serviceId: serviceId(s.service), isFeatured: order === 0, sortOrder: order++ });
    }
    for (const v of plan.videos ?? []) {
      const frame = await renderArt(v.scene, palette, 1600, 2000, seed++);
      const row = await ingestUpload({ ownerUserId: owner, businessId: biz.id, purpose: "portfolio", data: await clip(frame), alt: v.caption });
      await processVideo(row.id);
      await db.insert(portfolioItems).values({ businessId: biz.id, kind: "video", mediaId: row.id, caption: v.caption, serviceId: serviceId(v.service), sortOrder: order++ });
    }
    console.log(`✓ ${slug}: cover, logo, ${plan.shots.length} photos${plan.videos?.length ? `, ${plan.videos.length} video` : ""}`);
  }
  await sqlClient.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
