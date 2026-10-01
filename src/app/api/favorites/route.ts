import { z } from "zod";
import { readJson, route, zId } from "@/server/http";
import { setFavorite } from "@/server/services/engagement";

export const POST = route({ auth: true }, async ({ req, viewer }) => {
  const { businessId, on } = await readJson(req, z.object({ businessId: zId, on: z.boolean() }));
  return setFavorite(viewer, businessId, on);
});
