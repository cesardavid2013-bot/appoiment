import { z } from "zod";
import { forbidden } from "@/domain/errors";
import { proRoute, readJson } from "@/server/http";
import { businessTransition } from "@/server/services/booking";
import { proAppointmentDetail } from "@/server/services/pro";

export const POST = proRoute<{ id: string }>(["appointments.manage_all", "appointments.manage_own"], async ({ req, viewer, m, params }) => {
  const id = z.string().uuid().parse(params.id);
  const { action, version } = await readJson(req, z.object({ action: z.enum(["approve", "check_in", "start", "complete", "no_show", "undo_no_show"]), version: z.number().int().optional() }));
  const d = await proAppointmentDetail(m, id);
  if (!d.canManage) throw forbidden();
  const a = await businessTransition(viewer.id, m.businessId, id, action, version);
  return { status: a.status, version: a.version };
});
