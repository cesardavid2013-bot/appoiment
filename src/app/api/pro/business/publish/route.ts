import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { publishBusiness, unpublishBusiness } from "@/server/services/business";

export const POST = proRoute("business.manage", async ({ req, viewer, m }) => {
  const { live } = await readJson(req, z.object({ live: z.boolean() }));
  if (live) await publishBusiness(m, viewer.id);
  else await unpublishBusiness(m, viewer.id);
  return { live };
});
