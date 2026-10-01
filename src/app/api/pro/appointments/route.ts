import { proRoute, readJson } from "@/server/http";
import { createManualBooking, manualBookingSchema } from "@/server/services/manual-booking";

export const POST = proRoute(["appointments.manage_all", "appointments.manage_own"], async ({ req, viewer, m }) => createManualBooking(m, viewer.id, await readJson(req, manualBookingSchema)));
