import { describe, expect, it } from "vitest";
import { isValidTimeZone, mergeNotificationPrefs, normalizePhone } from "@/domain/account";
import { DEFAULT_PREFS } from "@/domain/notifications";

describe("normalizePhone", () => {
  it("keeps a leading plus and strips formatting", () => {
    expect(normalizePhone("+1 (312) 555-0199")).toBe("+13125550199");
    expect(normalizePhone("312.555.0199")).toBe("3125550199");
  });
  it("rejects letters, too few or too many digits, and stray plus signs", () => {
    expect(normalizePhone("12ab")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull();
    expect(normalizePhone("+1 555+0199 22")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("mergeNotificationPrefs", () => {
  it("applies changes on top of stored preferences", () => {
    const out = mergeNotificationPrefs({ marketing: { email: true, sms: false } }, { reminders: { email: false } }, { smsAvailable: false });
    expect(out.reminders.email).toBe(false);
    expect(out.marketing.email).toBe(true);
    expect(out.messages).toEqual(DEFAULT_PREFS.messages);
  });

  it("never lets transactional email be turned off", () => {
    const out = mergeNotificationPrefs({ bookings: { email: false, sms: false } }, { bookings: { email: false }, business: { email: false } }, { smsAvailable: true });
    expect(out.bookings.email).toBe(true);
    expect(out.business.email).toBe(true);
  });

  it("ignores SMS changes when SMS isn't available", () => {
    expect(mergeNotificationPrefs({}, { reminders: { sms: true } }, { smsAvailable: false }).reminders.sms).toBe(false);
    expect(mergeNotificationPrefs({}, { reminders: { sms: true } }, { smsAvailable: true }).reminders.sms).toBe(true);
  });

  it("falls back to defaults for malformed stored data", () => {
    expect(mergeNotificationPrefs("garbage", {}, { smsAvailable: false })).toEqual(DEFAULT_PREFS);
  });
});
