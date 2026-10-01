import { describe, expect, it } from "vitest";
import { canTransition } from "@/domain/appointment-state";
import { validateAnswers, formFieldsSchema, type FormField } from "@/domain/forms";
import { can, permissionsFor } from "@/domain/permissions";
import { customerCancellation, customerReschedule, type PolicyAppointment } from "@/domain/policies";
import { isValidSlug, normalizeSearch, slugify } from "@/domain/slugs";

const start = new Date("2026-05-10T15:00:00Z");
const appt = (over: Partial<PolicyAppointment> = {}): PolicyAppointment => ({
  status: "confirmed",
  startsAt: start,
  totalCents: 10_000,
  depositDueCents: 2_500,
  amountPaidCents: 2_500,
  amountRefundedCents: 0,
  rescheduleCount: 0,
  policy: { cancellationWindowHours: 24, rescheduleWindowHours: 12, lateCancelFeePercent: 50, depositRefundable: true },
  ...over,
});
const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

describe("customerCancellation", () => {
  it("refunds everything when cancelled in time", () => {
    const r = customerCancellation(appt(), hoursBefore(48));
    expect(r).toMatchObject({ allowed: true, isLate: false, refundCents: 2500, keptCents: 0 });
  });

  it("keeps up to the late fee when cancelled late", () => {
    const r = customerCancellation(appt(), hoursBefore(2));
    // 50% of $100 = $50 fee, but only $25 was paid.
    expect(r).toMatchObject({ allowed: true, isLate: true, keptCents: 2500, refundCents: 0, unpaidFeeCents: 2500 });
  });

  it("keeps non-refundable deposits even when on time", () => {
    const r = customerCancellation(appt({ policy: { ...appt().policy, depositRefundable: false } }), hoursBefore(72));
    expect(r).toMatchObject({ keptCents: 2500, refundCents: 0 });
  });

  it("never charges for unconfirmed requests", () => {
    const r = customerCancellation(appt({ status: "requested" }), hoursBefore(1));
    expect(r).toMatchObject({ allowed: true, keptCents: 0 });
  });

  it("refuses after the start or for terminal states", () => {
    expect(customerCancellation(appt(), new Date(start.getTime() + 1)).allowed).toBe(false);
    expect(customerCancellation(appt({ status: "completed" }), hoursBefore(48)).allowed).toBe(false);
  });
});

describe("customerReschedule", () => {
  it("respects the reschedule window and limit", () => {
    expect(customerReschedule(appt(), hoursBefore(13)).allowed).toBe(true);
    expect(customerReschedule(appt(), hoursBefore(11)).allowed).toBe(false);
    expect(customerReschedule(appt({ rescheduleCount: 3 }), hoursBefore(48)).allowed).toBe(false);
  });
});

describe("appointment state machine", () => {
  it("allows the normal lifecycle and blocks resurrection", () => {
    expect(canTransition("pending_payment", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "checked_in")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("completed", "cancelled")).toBe(false);
    expect(canTransition("requested", "completed")).toBe(false);
  });
});

describe("permissions", () => {
  it("scopes preset roles", () => {
    expect(can("owner", [], "team.manage")).toBe(true);
    expect(can("manager", [], "team.manage")).toBe(false);
    expect(can("provider", [], "appointments.manage_all")).toBe(false);
    expect(can("provider", [], "appointments.manage_own")).toBe(true);
  });
  it("custom roles only grant known permissions", () => {
    const p = permissionsFor("custom", ["customers.view", "root.everything"]);
    expect([...p]).toEqual(["customers.view"]);
  });
});

describe("forms", () => {
  const fields: FormField[] = [
    { id: "q1", type: "yes_no", label: "Do you currently have acrylic nails?", required: true },
    { id: "q2", type: "single_choice", label: "Vehicle type", required: true, options: ["Sedan", "SUV", "Truck"] },
    { id: "q3", type: "multi_choice", label: "Goals", required: false, options: ["Strength", "Mobility"] },
    { id: "q4", type: "acknowledgement", label: "I agree to the waiver", required: true },
    { id: "q5", type: "long_text", label: "Notes", required: false },
  ];

  it("validates and normalises answers", () => {
    const r = validateAnswers(fields, { q1: false, q2: "SUV", q3: ["Mobility", "Mobility"], q4: true, q5: "  hi " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answers.find((a) => a.fieldId === "q3")!.answer).toEqual(["Mobility"]);
      expect(r.answers.find((a) => a.fieldId === "q5")!.answer).toBe("hi");
    }
  });

  it("reports required, invalid choices and unchecked acknowledgements", () => {
    const r = validateAnswers(fields, { q2: "Boat", q4: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["q1", "q2", "q4"]);
  });

  it("rejects malformed form definitions", () => {
    expect(formFieldsSchema.safeParse([{ id: "a", type: "single_choice", label: "x", options: ["one"] }]).success).toBe(false);
    expect(formFieldsSchema.safeParse([{ id: "a", type: "yes_no", label: "x" }, { id: "a", type: "yes_no", label: "y" }]).success).toBe(false);
  });
});

describe("slugs", () => {
  it("creates clean, safe handles", () => {
    expect(slugify("Café Noir & Co.")).toBe("cafe-noir-and-co");
    expect(isValidSlug("explore")).toBe(false);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("fade-house")).toBe(true);
    expect(normalizeSearch("  Ünïque   FADE!! ")).toBe("unique fade");
  });
});
