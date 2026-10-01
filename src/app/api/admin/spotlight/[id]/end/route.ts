import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { endSpotlightCampaign, endSpotlightSchema } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer);
  return endSpotlightCampaign(viewer, zId.parse(params.id), await readJson(req, endSpotlightSchema));
});
