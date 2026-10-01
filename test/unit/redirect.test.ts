import { describe, expect, it } from "vitest";
import { safeNext } from "@/server/auth/redirect";

describe("safeNext", () => {
  it.each([
    ["/bookings", "/bookings"],
    ["/fade-house/book?service=x", "/fade-house/book?service=x"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/api/auth/logout", "/"],
    ["/\t/evil.example", "/"],
    ["/\u0009/evil.example", "/"],
    ["/\r\n/evil.example", "/"],
    ["/a\\b", "/"],
    ["/%09/evil.example", "/%09/evil.example"],
    ["/bookings#top", "/bookings#top"],
    [null, "/"],
  ])("%s → %s", (input, expected) => expect(safeNext(input as string | null)).toBe(expected));
});
