import { describe, expect, it } from "vitest";
import { checkLocales, placeholders } from "@/i18n/check";
import { formatMessage } from "@/i18n/format-message";
import { matchLocale } from "@/i18n/locales";

describe("i18n", () => {
  it("negotiates the browser language", () => {
    expect(matchLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(matchLocale("zh-TW,zh;q=0.9")).toBe("zh-TW");
    expect(matchLocale("zh-CN")).toBe("zh");
    expect(matchLocale("tl-PH")).toBe("fil");
    expect(matchLocale("xx-YY")).toBe("en");
    expect(matchLocale(null)).toBe("en");
  });

  it("formats variables and plurals per language", () => {
    expect(formatMessage("{n, plural, one {# pro} other {# pros}}", { n: 1 }, "en-US")).toBe("1 pro");
    expect(formatMessage("{n, plural, one {# pro} other {# pros}}", { n: 3 }, "en-US")).toBe("3 pros");
    expect(formatMessage("{n, plural, one {# cita} other {# citas}}", { n: 1200 }, "es")).toBe("1200 citas".replace("1200", new Intl.NumberFormat("es").format(1200)));
    expect(formatMessage("Hi {name}!", { name: "Ana" }, "en-US")).toBe("Hi Ana!");
    expect(formatMessage("{kind, select, pro {Business} other {Client}}", { kind: "pro" }, "en-US")).toBe("Business");
    expect(placeholders("From {price} · {n, plural, one {# day} other {# days}}")).toEqual(["n", "price"]);
  });

  it("every translation keeps English's keys and placeholders", () => {
    for (const r of checkLocales().report) {
      expect(r.unknown, `${r.locale}: keys not in English`).toEqual([]);
      expect(r.broken, `${r.locale}: placeholders differ from English`).toEqual([]);
    }
  });
});
