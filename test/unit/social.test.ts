import { describe, expect, it } from "vitest";
import { embedFrame, normalizeSocial, parseEmbedUrl, socialHref } from "@/domain/social";

const ok = (url: string) => {
  const r = parseEmbedUrl(url);
  if (!r.ok) throw new Error(`${url}: ${r.error}`);
  return r.embed;
};

describe("social embeds: strict URL parsing", () => {
  it("accepts the providers' canonical links", () => {
    expect(ok("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ provider: "youtube", providerId: "dQw4w9WgXcQ" });
    expect(ok("https://youtu.be/dQw4w9WgXcQ?t=10")).toMatchObject({ provider: "youtube", providerId: "dQw4w9WgXcQ" });
    expect(ok("https://youtube.com/shorts/dQw4w9WgXcQ")).toMatchObject({ provider: "youtube", kind: "short" });
    expect(ok("https://www.tiktok.com/@maker/video/7234567890123456789")).toMatchObject({ provider: "tiktok", providerId: "7234567890123456789" });
    expect(ok("https://www.instagram.com/reel/Cx1AbC2dEfG/")).toMatchObject({ provider: "instagram", kind: "reel" });
    expect(ok("https://vimeo.com/123456789")).toMatchObject({ provider: "vimeo", providerId: "123456789" });
    expect(ok("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toMatchObject({ provider: "spotify", kind: "track" });
  });

  it("rejects look-alike hosts, other schemes and junk", () => {
    for (const bad of [
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://evil.example/?u=https://youtube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "http://www.youtube.com/watch?v=<script>",
      "https://www.youtube.com/watch?v=short",
      "https://open.spotify.com/track/../../evil",
      "data:text/html,<iframe>",
      "",
    ]) {
      expect(parseEmbedUrl(bad).ok, bad).toBe(false);
    }
  });

  it("builds iframe sources from the parsed id only, on privacy-friendly hosts", () => {
    const e = ok("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(embedFrame(e.provider, e.kind, e.providerId)?.src.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(true);
    expect(embedFrame("youtube", "video", "x\"><script>")).toBeNull();
    expect(embedFrame("evil", "video", "dQw4w9WgXcQ")).toBeNull();
  });

  it("normalizes social handles and only links to https", () => {
    const r = normalizeSocial("instagram", "https://instagram.com/north.fade/");
    expect(r).toEqual({ ok: true, value: "north.fade" });
    expect(socialHref("instagram", "north.fade")).toBe("https://www.instagram.com/north.fade/");
    expect(normalizeSocial("instagram", "javascript:alert(1)").ok).toBe(false);
  });
});
