import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { reorderServices } from "@/server/services/catalog-admin";

export const POST = proRoute("services.manage", async ({ req, m }) => {
  await reorderServices(m, (await readJson(req, z.object({ ids: z.array(z.string().uuid()).max(500) }))).ids);
  return { ok: true };
});
