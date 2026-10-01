import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { moderateReview, reviewStatusSchema } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer);
  return moderateReview(viewer, zId.parse(params.id), await readJson(req, reviewStatusSchema));
});
