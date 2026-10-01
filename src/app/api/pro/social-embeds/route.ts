import { proRoute, readJson } from "@/server/http";
import { addSocialEmbed, listSocialEmbeds, socialEmbedSchema } from "@/server/services/social-embeds";

export const GET = proRoute("portfolio.manage", async ({ m }) => listSocialEmbeds(m.businessId));
export const POST = proRoute("portfolio.manage", async ({ req, viewer, m }) => {
  const row = await addSocialEmbed(m, viewer.id, await readJson(req, socialEmbedSchema));
  return { id: row.id };
});
