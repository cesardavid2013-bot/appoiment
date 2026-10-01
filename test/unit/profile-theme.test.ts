import { describe, expect, it } from "vitest";
import { accentVars, DEFAULT_THEME, MOVABLE_SECTIONS, normalizeTheme, safeThemeUrl } from "@/domain/profile-theme";

describe("profile theme", () => {
  it("falls back to the defaults for anything unusable", () => {
    for (const bad of [null, undefined, 42, "x", [], {}]) expect(normalizeTheme(bad)).toEqual(DEFAULT_THEME);
  });

  it("keeps valid choices and repairs the section list", () => {
    const t = normalizeTheme({ masthead: "ivory", accent: "rose", order: ["about", "work", "work", "bogus"], hidden: ["work", "reviews", "about", "nope"] });
    expect(t.masthead).toBe("ivory");
    expect(t.accent).toBe("rose");
    expect(t.order.slice(0, 2)).toEqual(["about", "work"]);
    expect([...t.order].sort()).toEqual([...MOVABLE_SECTIONS].sort());
    // Reviews and About can never be hidden.
    expect(t.hidden).toEqual(["work"]);
  });

  it("only accepts https link targets and trims text", () => {
    expect(safeThemeUrl("example.com/menu")).toBe("https://example.com/menu");
    for (const bad of ["javascript:alert(1)", "http://example.com", "https://user:pw@example.com", "https://example.com:8443", "https://localhost", "ftp://x.com", "", "https://" + "a".repeat(400) + ".com"]) {
      expect(safeThemeUrl(bad), bad).toBeNull();
    }
    const t = normalizeTheme({ links: [{ label: "  Gift   cards ", url: "shop.example.com" }, { label: "", url: "https://x.com" }, { label: "Bad", url: "javascript:1" }], notice: "  Closed   Dec 24  " });
    expect(t.links).toEqual([{ label: "Gift cards", url: "https://shop.example.com/" }]);
    expect(t.notice).toBe("Closed Dec 24");
  });

  it("caps links and exposes accent variables for both surfaces", () => {
    const links = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, url: `https://e${i}.com` }));
    expect(normalizeTheme({ links }).links).toHaveLength(8);
    expect(accentVars("emerald", "light")["--gold-text"]).toBe("#2c5a41");
    expect(accentVars("emerald", "dark")["--gold"]).toBe("#6fb592");
  });
});
