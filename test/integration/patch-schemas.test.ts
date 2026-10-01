import { describe, expect, it } from "vitest";
import { bookingRulesSchema, policiesSchema, profilePatchSchema } from "@/server/services/business";

describe("patch schemas never invent values for omitted fields", () => {
  it("profile", () => {
    expect(profilePatchSchema.parse({ tagline: "Hi" })).toEqual({ tagline: "Hi" });
  });
  it("booking rules", () => {
    expect(bookingRulesSchema.partial().parse({ bookingMode: "request" })).toEqual({ bookingMode: "request" });
  });
  it("policies", () => {
    expect(policiesSchema.partial().parse({ cancellationWindowHours: 12 })).toEqual({ cancellationWindowHours: 12 });
  });
});
