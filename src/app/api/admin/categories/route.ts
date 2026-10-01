import { requireAdmin } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { categoryInputSchema, createCategory } from "@/server/services/admin";

export const POST = route({ auth: true }, async ({ req, viewer }) => {
  requireAdmin(viewer);
  return createCategory(viewer, await readJson(req, categoryInputSchema));
});
