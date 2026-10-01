import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { reorderPortfolio } from "@/server/services/portfolio";

export const POST = proRoute("portfolio.manage", async ({ req, m }) => {
  await reorderPortfolio(m, (await readJson(req, z.object({ ids: z.array(z.string().uuid()).max(200) }))).ids);
  return { ok: true };
});
