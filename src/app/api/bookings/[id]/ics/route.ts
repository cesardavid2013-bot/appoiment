import { z } from "zod";
import { route } from "@/server/http";
import { env } from "@/server/env";
import { getCustomerAppointment } from "@/server/services/booking";

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Calendar file for the customer's own appointment. */
export const GET = route<{ id: string }>({ auth: true }, async ({ viewer, params }) => {
  const a = await getCustomerAppointment(viewer, z.string().uuid().parse(params.id));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kept//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${a.id}@kept`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(a.startsAt)}`,
    `DTEND:${icsDate(a.endsAt)}`,
    `SUMMARY:${esc(a.snapshot.serviceName)}`,
    `DESCRIPTION:${esc(`Booking ${a.reference}. Manage: ${env.APP_URL}/bookings/${a.id}`)}`,
    ...(a.snapshot.address ? [`LOCATION:${esc(a.snapshot.address)}`] : []),
    `STATUS:${a.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n"), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="booking-${a.reference}.ics"`, "cache-control": "no-store" },
  });
});
