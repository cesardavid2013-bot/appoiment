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
    [null, "/"],
  ])("%s → %s", (input, expected) => expect(safeNext(input as string | null)).toBe(expected));
});
