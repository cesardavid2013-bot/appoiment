import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "@/domain/errors";
import { db } from "@/server/db/client";
import { businesses, services } from "@/server/db/schema";
import { route } from "@/server/http";
import { getBookingServiceDetail } from "@/server/services/catalog";

/** Public booking details for one service (options, staff, intake questions). */
export const GET = route<{ id: string }>(async ({ params }) => {
  const id = z.string().uuid().parse(params.id);
  const [row] = await db
    .select({ businessId: services.businessId })
    .from(services)
    .innerJoin(businesses, eq(businesses.id, services.businessId))
    .where(and(eq(services.id, id), eq(businesses.status, "active")));
  if (!row) throw notFound("That service");
  const detail = await getBookingServiceDetail(row.businessId, id);
  if (!detail) throw notFound("That service");
  return detail;
});
