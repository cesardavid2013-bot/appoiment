import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { decideVerification, verificationDecisionSchema } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer);
  return decideVerification(viewer, zId.parse(params.id), await readJson(req, verificationDecisionSchema));
});
