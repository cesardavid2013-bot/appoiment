import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { categoryMoveSchema, moveCategory } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer);
  const { direction } = await readJson(req, categoryMoveSchema);
  return moveCategory(viewer, zId.parse(params.id), direction);
});
