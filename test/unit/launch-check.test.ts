import { describe, expect, it } from "vitest";
import { launchChecks, launchVerdict } from "@/domain/launch-check";

const good = {
  NODE_ENV: "production",
  APP_URL: "https://kept.example.org",
  APP_SECRET: "k9Zq2mXw7Lr4Tn8Vb3Yc6Hd1Fs5Gj0Pa",
  STRIPE_SECRET_KEY: "sk_live_abc",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_abc",
  RESEND_API_KEY: "re_abc",
  EMAIL_FROM: "Kept <hello@kept.test>",
  STORAGE_DRIVER: "s3",
  CRON_SECRET: "c",
  TRUSTED_PROXY_HOPS: "1",
};
const ids = (e: Record<string, string | undefined>, sev: string) => launchChecks(e).filter((c) => c.severity === sev).map((c) => c.id);

describe("launch check", () => {
  it("passes a complete production setup", () => {
    expect(launchVerdict(launchChecks(good))).toMatchObject({ ready: true, blockers: 0 });
  });
  it("blocks on the things that lose money or mail", () => {
    expect(ids({ ...good, APP_URL: "http://localhost:3000" }, "blocker")).toContain("app-url");
    expect(ids({ ...good, STRIPE_SECRET_KEY: undefined }, "blocker")).toContain("stripe-keys");
    expect(ids({ ...good, STRIPE_WEBHOOK_SECRET: "" }, "blocker")).toContain("stripe-webhook");
    expect(ids({ ...good, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x" }, "blocker")).toContain("stripe-mismatch");
    expect(ids({ ...good, RESEND_API_KEY: undefined }, "blocker")).toContain("email");
    expect(ids({ ...good, EMAIL_FROM: "Kept <hello@example.com>" }, "blocker")).toContain("email-from");
    expect(ids({ ...good, APP_SECRET: "change-me-to-a-long-random-string-please" }, "blocker")).toContain("secret");
  });
  it("treats test keys and local storage as warnings, not blockers", () => {
    const e = { ...good, STRIPE_SECRET_KEY: "sk_test_x", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x", STORAGE_DRIVER: "local" };
    expect(ids(e, "blocker")).toEqual([]);
    expect(ids(e, "warning")).toEqual(expect.arrayContaining(["stripe-live", "storage"]));
  });
});
