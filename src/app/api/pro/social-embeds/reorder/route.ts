import { z } from "zod";
import { MAX_EMBEDS } from "@/domain/social";
import { proRoute, readJson } from "@/server/http";
import { reorderSocialEmbeds } from "@/server/services/social-embeds";

export const POST = proRoute("portfolio.manage", async ({ req, m }) => {
  await reorderSocialEmbeds(m, (await readJson(req, z.object({ ids: z.array(z.string().uuid()).max(MAX_EMBEDS) }))).ids);
  return { ok: true };
});
