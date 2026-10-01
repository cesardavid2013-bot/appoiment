import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { setUserRole, userRoleSchema } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer);
  return setUserRole(viewer, zId.parse(params.id), await readJson(req, userRoleSchema));
});
