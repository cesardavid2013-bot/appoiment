import { z } from "zod";
import { rateLimit } from "@/server/rate-limit";
import { readQuery, route, zId, zIsoDate } from "@/server/http";
import { ipHash } from "@/server/request";
import { getSlots } from "@/server/services/availability";

const schema = z.object({
  serviceId: zId,
  memberId: z.union([zId, z.literal("any")]).default("any"),
  locationId: zId.optional(),
  from: zIsoDate,
  to: zIsoDate,
  options: z.union([zId, z.array(zId)]).optional(),
});

export const GET = route(async ({ req }) => {
  await rateLimit("slots", await ipHash());
  const q = readQuery(req, schema);
  const optionIds = q.options ? (Array.isArray(q.options) ? q.options : [q.options]) : [];
  return getSlots({ serviceId: q.serviceId, memberId: q.memberId, locationId: q.locationId ?? null, fromDate: q.from, toDate: q.to, optionIds });
});
