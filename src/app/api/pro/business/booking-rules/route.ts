import { proRoute, readJson } from "@/server/http";
import { bookingRulesSchema, updateBookingRules } from "@/server/services/business";

export const PUT = proRoute("business.manage", async ({ req, viewer, m }) => {
  await updateBookingRules(m, viewer.id, await readJson(req, bookingRulesSchema.partial()));
  return { ok: true };
});
