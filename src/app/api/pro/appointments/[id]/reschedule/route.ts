import { z } from "zod";
import { forbidden } from "@/domain/errors";
import { proRoute, readJson } from "@/server/http";
import { reschedule } from "@/server/services/booking";
import { proAppointmentDetail } from "@/server/services/pro";

export const POST = proRoute<{ id: string }>(["appointments.manage_all", "appointments.manage_own"], async ({ req, viewer, m, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await readJson(req, z.object({ start: z.string().datetime({ offset: true }), memberId: z.union([z.string().uuid(), z.literal("same"), z.literal("any")]).default("same"), force: z.boolean().default(false) }));
  const d = await proAppointmentDetail(m, id);
  if (!d.canManage) throw forbidden();
  if (input.memberId !== "same" && input.memberId !== d.appointment.memberId && !m.permissions.has("appointments.manage_all")) throw forbidden("You can't move appointments to someone else's calendar.");
  return reschedule({ type: "business", userId: viewer.id }, id, { start: input.start, memberId: input.memberId }, { businessId: m.businessId, force: input.force });
});
