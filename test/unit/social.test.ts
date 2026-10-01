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

describe("social embeds: Apple Music, Apple Podcasts, Mixcloud", () => {
  it("parses and rebuilds canonical links", () => {
    expect(ok("https://music.apple.com/us/album/blonde/1146195596")).toMatchObject({ provider: "applemusic", kind: "album", providerId: "us/blonde/1146195596" });
    const song = ok("https://music.apple.com/us/album/blonde/1146195596?i=1146195611");
    expect(song).toMatchObject({ kind: "track", providerId: "us/blonde/1146195596:1146195611", url: "https://music.apple.com/us/album/blonde/1146195596?i=1146195611" });
    expect(ok("https://music.apple.com/es/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb")).toMatchObject({ kind: "playlist" });
    expect(ok("https://music.apple.com/us/artist/frank-ocean/368183298")).toMatchObject({ kind: "artist" });
    expect(ok("https://podcasts.apple.com/us/podcast/the-daily/id1200361736")).toMatchObject({ provider: "applepodcasts", kind: "show" });
    expect(ok("https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000500000001")).toMatchObject({ kind: "episode" });
    expect(ok("https://www.mixcloud.com/NTSRadio/floating-points-2020/")).toMatchObject({ provider: "mixcloud", providerId: "NTSRadio/floating-points-2020" });
  });

  it("builds players only on the providers' embed hosts", () => {
    const album = ok("https://music.apple.com/us/album/blonde/1146195596");
    expect(embedFrame(album.provider, album.kind, album.providerId)?.src).toBe("https://embed.music.apple.com/us/album/blonde/1146195596");
    const pod = ok("https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000500000001");
    expect(embedFrame(pod.provider, pod.kind, pod.providerId)?.src).toBe("https://embed.podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000500000001");
    const mix = ok("https://www.mixcloud.com/NTSRadio/floating-points-2020/");
    expect(embedFrame(mix.provider, mix.kind, mix.providerId)?.src).toContain("https://www.mixcloud.com/widget/iframe/");
  });

  it("rejects look-alike hosts, odd paths and tampered stored ids", () => {
    for (const url of ["https://music.apple.com.evil.test/us/album/x/1146195596", "https://music.apple.com/us/album/x/abc", "https://music.apple.com/us/station/x/1146195596", "https://podcasts.apple.com/us/show/x/id1", "https://www.mixcloud.com/discover/x/", "https://www.mixcloud.com/a/b/c/"]) {
      expect(parseEmbedUrl(url).ok, url).toBe(false);
    }
    expect(embedFrame("applemusic", "album", "us/../1146195596")).toBeNull();
    expect(embedFrame("applemusic", "album", "us/x/1146195596:5")).toBeNull();
    expect(embedFrame("mixcloud", "track", "a/b/c")).toBeNull();
  });
});
