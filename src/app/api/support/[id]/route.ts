import { z } from "zod";
import { notFound } from "@/domain/errors";
import { readJson, route, zId } from "@/server/http";
import { getMyTicket, resolveMyTicket } from "@/server/services/support";

export const GET = route<{ id: string }>({ auth: true }, async ({ viewer, params }) => {
  const t = await getMyTicket(viewer.id, zId.parse(params.id));
  if (!t) throw notFound("That request");
  return t;
});

/** Customers can only mark their own request as resolved. */
export const PATCH = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  await readJson(req, z.object({ status: z.literal("resolved") }));
  return resolveMyTicket(viewer, zId.parse(params.id));
});
