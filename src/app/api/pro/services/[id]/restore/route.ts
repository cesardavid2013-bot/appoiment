import { z } from "zod";
import { proRoute } from "@/server/http";
import { restoreService } from "@/server/services/catalog-admin";

export const POST = proRoute<{ id: string }>("services.manage", async ({ viewer, m, params }) => {
  await restoreService(m, viewer.id, z.string().uuid().parse(params.id));
  return { ok: true };
});
