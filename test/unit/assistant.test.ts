import { describe, expect, it } from "vitest";
import { matchesWhen, parseRequest, parseWhen, type SearchIntent } from "@/domain/assistant";
import { normalizeSearch } from "@/domain/slugs";

const TODAY = "2026-10-01"; // a Thursday
const search = (text: string) => {
  const r = parseRequest(text, TODAY);
  expect(r.intent.kind).toBe("search");
  return { ...(r.intent as SearchIntent), lang: r.lang };
};

describe("assistant: understanding requests", () => {
  it("Spanish barber tomorrow afternoon near me under $40", () => {
    const s = search("Quiero un barbero mañana por la tarde cerca de mí por menos de $40");
    expect(s).toMatchObject({ lang: "es", category: "barber", nearMe: true, maxPriceCents: 4000, sort: "distance" });
    expect(s.when).toMatchObject({ dates: ["2026-10-02"], part: "afternoon" });
  });

  it("'mañana por la mañana' is tomorrow morning; 'por la mañana' alone is just morning", () => {
    expect(search("masaje mañana por la mañana").when).toMatchObject({ dates: ["2026-10-02"], part: "morning" });
    expect(search("uñas por la mañana").when).toMatchObject({ part: "morning", dates: ["2026-10-01", "2026-10-02", "2026-10-03"] });
  });

  it("English nails this weekend, best rated", () => {
    const s = search("best rated gel nails this weekend");
    expect(s).toMatchObject({ lang: "en", category: "nails", sort: "rating" });
    expect(s.when?.dates).toEqual(["2026-10-03", "2026-10-04"]);
  });

  it("times: 'a las 5' means 5 PM, '10am' stays morning", () => {
    expect(parseWhen(normalizeSearch("hoy a las 5"), TODAY)?.minute).toBe(17 * 60);
    expect(parseWhen(normalizeSearch("tomorrow at 10am"), TODAY)?.minute).toBe(10 * 60);
    expect(parseWhen(normalizeSearch("friday 6:30 pm"), TODAY)).toMatchObject({ dates: ["2026-10-02"], minute: 18 * 60 + 30 });
  });

  it("weekday names resolve to the next occurrence", () => {
    expect(search("personal trainer on monday").when?.dates).toEqual(["2026-10-05"]);
    expect(search("clases de piano el sábado").when?.dates).toEqual(["2026-10-03"]);
  });

  it("mobile and online services", () => {
    expect(search("car detailing that comes to me")).toMatchObject({ category: "automotive", mobile: true });
    expect(search("tutor de matemáticas en línea")).toMatchObject({ category: "education", virtual: true });
  });

  it("keeps useful service words for matching", () => {
    expect(search("skin fade with beard trim").terms).toEqual(expect.arrayContaining(["trim"]));
    expect(search("knotless braids").category).toBe("braids-locs");
  });

  it("navigation requests", () => {
    expect(parseRequest("mis citas", TODAY).intent).toEqual({ kind: "navigate", target: "bookings" });
    expect(parseRequest("I need to cancel my appointment", TODAY).intent).toEqual({ kind: "navigate", target: "cancel" });
    expect(parseRequest("quiero ofrecer mis servicios", TODAY).intent).toEqual({ kind: "navigate", target: "become_pro" });
    expect(parseRequest("open my messages", TODAY).intent).toEqual({ kind: "navigate", target: "messages" });
  });

  it("small talk", () => {
    expect(parseRequest("hola", TODAY).intent.kind).toBe("greeting");
    expect(parseRequest("thanks!", TODAY).intent.kind).toBe("thanks");
    expect(parseRequest("qué puedes hacer?", TODAY).intent.kind).toBe("help");
  });

  it("time windows", () => {
    expect(matchesWhen(9 * 60, { part: "morning" })).toBe(true);
    expect(matchesWhen(13 * 60, { part: "morning" })).toBe(false);
    expect(matchesWhen(18 * 60, { minute: 17 * 60 })).toBe(true);
    expect(matchesWhen(20 * 60, { minute: 17 * 60 })).toBe(false);
  });
});
