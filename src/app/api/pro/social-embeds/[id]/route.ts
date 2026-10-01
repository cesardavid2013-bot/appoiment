import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { removeSocialEmbed, socialEmbedUpdateSchema, updateSocialEmbed } from "@/server/services/social-embeds";

export const PUT = proRoute<{ id: string }>("portfolio.manage", async ({ req, viewer, m, params }) => {
  await updateSocialEmbed(m, viewer.id, z.string().uuid().parse(params.id), await readJson(req, socialEmbedUpdateSchema));
  return { ok: true };
});
export const DELETE = proRoute<{ id: string }>("portfolio.manage", async ({ viewer, m, params }) => {
  await removeSocialEmbed(m, viewer.id, z.string().uuid().parse(params.id));
  return { ok: true };
});
