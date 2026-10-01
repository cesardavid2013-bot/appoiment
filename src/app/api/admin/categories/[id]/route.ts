import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { categoryInputSchema, deleteCategory, updateCategory } from "@/server/services/admin";

export const PATCH = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer);
  return updateCategory(viewer, zId.parse(params.id), await readJson(req, categoryInputSchema));
});

export const DELETE = route<{ id: string }>({ auth: true }, async ({ viewer, params }) => {
  requireAdmin(viewer);
  return deleteCategory(viewer, zId.parse(params.id));
});
