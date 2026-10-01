import { readJson, route } from "@/server/http";
import { createBooking, createBookingSchema } from "@/server/services/booking";

export const POST = route({ auth: true }, async ({ req, viewer }) => createBooking(viewer, await readJson(req, createBookingSchema)));
