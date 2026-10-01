import { z } from "zod";
import { forbidden } from "@/domain/errors";
import { proRoute, readJson, zOptText } from "@/server/http";
import { businessCancel } from "@/server/services/booking";
import { proAppointmentDetail } from "@/server/services/pro";

export const POST = proRoute<{ id: string }>(["appointments.manage_all", "appointments.manage_own"], async ({ req, viewer, m, params }) => {
  const id = z.string().uuid().parse(params.id);
  const { reason, decline } = await readJson(req, z.object({ reason: zOptText(500), decline: z.boolean().default(false) }));
  const d = await proAppointmentDetail(m, id);
  if (!d.canManage) throw forbidden();
  return businessCancel(viewer.id, id, m.businessId, reason, decline ? "declined" : "cancelled");
});
