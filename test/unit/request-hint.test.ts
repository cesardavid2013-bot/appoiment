import { describe, expect, it } from "vitest";
import { looksLikeRequest } from "@/lib/request-hint";

describe("looksLikeRequest", () => {
  it("hands English and Spanish sentences to the assistant", () => {
    expect(looksLikeRequest("a barber tomorrow after 5")).toBe(true);
    expect(looksLikeRequest("gel nails under $60 this weekend")).toBe(true);
    expect(looksLikeRequest("uñas el sábado por la tarde")).toBe(true);
    expect(looksLikeRequest("necesito un masaje cerca")).toBe(true);
    expect(looksLikeRequest("barbero después de las 6")).toBe(true);
    expect(looksLikeRequest("corte de pelo mañana")).toBe(true);
  });

  it("keeps keywords and short queries as a normal search", () => {
    expect(looksLikeRequest("skin fade")).toBe(false);
    expect(looksLikeRequest("hoy")).toBe(false);
    expect(looksLikeRequest("North Fade Studio")).toBe(false);
    expect(looksLikeRequest("wedding photographer portfolio")).toBe(false);
  });
});
