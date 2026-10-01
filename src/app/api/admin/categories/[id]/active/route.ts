import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { categoryActiveSchema, setCategoryActive } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer);
  const { isActive } = await readJson(req, categoryActiveSchema);
  return setCategoryActive(viewer, zId.parse(params.id), isActive);
});
