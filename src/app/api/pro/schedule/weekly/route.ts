import { z } from "zod";
import { proRoute, readJson, readQuery } from "@/server/http";
import { markOnboardingStep } from "@/server/services/business";
import { getWeeklyHours, setWeeklyHours, weeklyHoursSchema } from "@/server/services/schedule";

export const GET = proRoute(["schedule.manage_own", "schedule.manage_all"], async ({ req, m }) => {
  const q = readQuery(req, z.object({ memberId: z.string().uuid().optional(), locationId: z.string().uuid().optional() }));
  return getWeeklyHours(m.businessId, q.memberId ?? null, q.locationId ?? null);
});
export const PUT = proRoute(["schedule.manage_own", "schedule.manage_all"], async ({ req, viewer, m }) => {
  await setWeeklyHours(m, viewer.id, await readJson(req, weeklyHoursSchema));
  await markOnboardingStep(m.businessId, "availability");
  return { ok: true };
});
