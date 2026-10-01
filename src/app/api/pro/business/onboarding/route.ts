import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { markOnboardingStep, ONBOARDING_STEPS } from "@/server/services/business";

export const POST = proRoute("business.manage", async ({ req, m }) => {
  const { step, kind } = await readJson(req, z.object({ step: z.enum(ONBOARDING_STEPS), kind: z.enum(["completed", "skipped"]).default("completed") }));
  await markOnboardingStep(m.businessId, step, kind);
  return { ok: true };
});
