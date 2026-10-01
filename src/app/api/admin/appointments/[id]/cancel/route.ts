import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { adminCancelAppointment, adminCancelSchema } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer);
  return adminCancelAppointment(viewer, zId.parse(params.id), await readJson(req, adminCancelSchema));
});
