import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { computeSlots } from "@/domain/availability";
import { AppError, notFound } from "@/domain/errors";
import { instantToLocal } from "@/domain/time";
import { db } from "../db/client";
import { isTimeConflict } from "../db/errors";
import { appointmentEvents, appointments, businessCustomers } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { bookingReference, randomToken } from "../crypto";
import { zId, zOptText } from "../http";
import { buildSlotQueries, candidateMembers, loadBookableService, resolveLocation, selectOptions } from "./availability";
import { onBooked } from "./appointment-notify";
import { buildSnapshot, quoteFor, reserveForAppointment } from "./booking";

export const manualBookingSchema = z
  .object({
    serviceId: zId,
    memberId: z.union([zId, z.literal("any")]),
    locationId: zId.nullable().optional(),
    start: z.string().datetime({ offset: true }),
    optionIds: z.array(zId).max(40).default([]),
    customerId: zId.nullable().optional(),
    newCustomer: z
      .object({
        name: z.string().trim().min(1, "Add the customer's name").max(80),
        email: z.string().trim().toLowerCase().email().max(254).nullable().optional().or(z.literal("").transform(() => null)),
        phone: zOptText(40),
      })
      .nullable()
      .optional(),
    note: zOptText(1000),
    /** Book outside normal hours (still never double-books). */
    allowOutsideHours: z.boolean().default(false),
    source: z.enum(["manual", "walk_in"]).default("manual"),
  })
  .refine((v) => v.customerId || v.newCustomer, { message: "Choose or add a customer", path: ["customerId"] });

/**
 * Front-desk booking: phone calls, walk-ins, regulars. Uses the same pricing
 * and reservation rules as online booking; may ignore notice windows and,
 * if explicitly requested, working hours — but never existing reservations.
 */
export async function createManualBooking(m: Membership, actorUserId: string, input: z.infer<typeof manualBookingSchema>) {
  const canAll = m.permissions.has("appointments.manage_all");
  if (!canAll && !(m.permissions.has("appointments.manage_own") && input.memberId === m.memberId)) {
    throw new AppError("forbidden", "You can only create appointments on your own calendar.");
  }
  const start = new Date(input.start);
  const svc = await loadBookableService(input.serviceId, db, { includeHidden: true });
  if (svc.business.id !== m.businessId) throw notFound("That service");
  const selected = selectOptions(svc, input.optionIds);
  const loc = resolveLocation(svc, input.locationId);
  const candidates = candidateMembers(svc, selected, loc?.id ?? null, input.memberId);
  const tz = loc?.timezone ?? svc.business.timezone;
  const localDate = instantToLocal(start.getTime(), tz).date;

  const created = await db.transaction(async (tx) => {
    let customer: typeof businessCustomers.$inferSelect;
    if (input.customerId) {
      const [c] = await tx.select().from(businessCustomers).where(and(eq(businessCustomers.id, input.customerId), eq(businessCustomers.businessId, m.businessId))).for("update");
      if (!c) throw notFound("That customer");
      customer = c;
    } else {
      const nc = input.newCustomer!;
      [customer] = await tx.insert(businessCustomers).values({ businessId: m.businessId, name: nc.name, email: nc.email ?? null, phone: nc.phone }).returning();
    }

    let order = candidates.map((c) => c.memberId);
    if (!input.allowOutsideHours) {
      const queries = await buildSlotQueries(
        { svc, selected, locationId: loc?.id ?? null, memberIds: order, fromDate: localDate, toDate: localDate, ignoreBookingWindow: true },
        tx,
      );
      // Staff calendars may use any minute, not just the public grid.
      const free = new Set<string>();
      for (const q of queries) {
        q.stepMinutes = 5;
        const slot = computeSlots(q)[0]?.slots.find((s) => s.start === start.getTime());
        slot?.memberIds.forEach((x) => free.add(x));
      }
      order = order.filter((x) => free.has(x));
      if (!order.length) throw new AppError("slot_unavailable", "That time is outside working hours or already booked. Turn on “Book outside hours” to override hours.");
    }

    for (const memberId of order) {
      const quote = quoteFor(svc, selected, memberId, null);
      const end = new Date(start.getTime() + quote.durationMinutes * 60_000);
      const blockStart = new Date(start.getTime() - svc.service.bufferBeforeMinutes * 60_000);
      const blockEnd = new Date(end.getTime() + svc.service.bufferAfterMinutes * 60_000);
      try {
        return await tx.transaction(async (sp) => {
          const [appt] = await sp
            .insert(appointments)
            .values({
              reference: bookingReference(),
              businessId: m.businessId,
              locationId: loc?.id ?? null,
              serviceId: svc.service.id,
              memberId,
              customerUserId: customer.userId,
              businessCustomerId: customer.id,
              status: "confirmed",
              source: input.source,
              startsAt: start,
              endsAt: end,
              blockStartsAt: blockStart,
              blockEndsAt: blockEnd,
              timezone: tz,
              selectedOptionIds: selected.map((o) => o.id),
              snapshot: buildSnapshot(svc, selected, memberId, loc, quote, quote.durationMinutes),
              customerNote: input.note,
              currency: quote.currency,
              subtotalCents: quote.subtotalCents,
              taxCents: quote.taxCents,
              feeCents: 0,
              totalCents: quote.totalCents - quote.feeCents,
              isEstimate: quote.isEstimate,
              depositDueCents: 0,
              paymentStatus: quote.totalCents === 0 && !quote.isEstimate ? "not_required" : "pay_in_person",
              confirmedAt: new Date(),
              checkInCode: randomToken(12),
              createdByUserId: actorUserId,
              checkedInAt: input.source === "walk_in" ? new Date() : null,
            })
            .returning();
          const { groupSessionId } = await reserveForAppointment(sp, svc, { appointmentId: appt.id, memberId, locationId: loc?.id ?? null, start, end, blockStart, blockEnd });
          if (groupSessionId) await sp.update(appointments).set({ groupSessionId }).where(eq(appointments.id, appt.id));
          await sp.update(businessCustomers).set({ appointmentCount: sql`${businessCustomers.appointmentCount} + 1` }).where(eq(businessCustomers.id, customer.id));
          await sp.insert(appointmentEvents).values({ appointmentId: appt.id, actorType: "business", actorUserId, type: "created", toStatus: "confirmed", data: { source: input.source, outsideHours: input.allowOutsideHours } });
          if (input.source === "walk_in") await sp.update(appointments).set({ status: "checked_in" }).where(eq(appointments.id, appt.id));
          await onBooked(sp, appt.id);
          return appt;
        });
      } catch (err) {
        if (isTimeConflict(err)) continue;
        throw err;
      }
    }
    throw new AppError("slot_unavailable", "That time overlaps another appointment for this professional.");
  });
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "appointment.manual_created", targetType: "appointment", targetId: created.id, metadata: { outsideHours: input.allowOutsideHours } });
  return { appointmentId: created.id, reference: created.reference };
}
