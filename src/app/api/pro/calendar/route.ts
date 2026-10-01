import { z } from "zod";
import { proRoute, readQuery } from "@/server/http";
import { calendarRange } from "@/server/services/pro";

export const GET = proRoute(null, async ({ req, m }) => {
  const q = readQuery(req, z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }), member: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional() }));
  return calendarRange(m, new Date(q.from), new Date(q.to), q.member ? (Array.isArray(q.member) ? q.member : [q.member]) : undefined);
});
