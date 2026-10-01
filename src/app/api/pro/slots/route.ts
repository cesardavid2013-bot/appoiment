import { z } from "zod";
import { proRoute, readQuery, zId, zIsoDate } from "@/server/http";
import { getSlots } from "@/server/services/availability";

const schema = z.object({ serviceId: zId, memberId: z.union([zId, z.literal("any")]).default("any"), locationId: zId.optional(), from: zIsoDate, to: zIsoDate, options: z.union([zId, z.array(zId)]).optional() });

/** Availability as the business sees it (works before going live, ignores booking notice). */
export const GET = proRoute(["appointments.manage_all", "appointments.manage_own"], async ({ req, m }) => {
  const q = readQuery(req, schema);
  const optionIds = q.options ? (Array.isArray(q.options) ? q.options : [q.options]) : [];
  return getSlots({ serviceId: q.serviceId, memberId: q.memberId, locationId: q.locationId ?? null, fromDate: q.from, toDate: q.to, optionIds, asBusinessId: m.businessId });
});
