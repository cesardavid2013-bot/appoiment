import { proRoute, readJson } from "@/server/http";
import { markOnboardingStep, policiesSchema, updatePolicies } from "@/server/services/business";

export const PUT = proRoute("business.manage", async ({ req, viewer, m }) => {
  await updatePolicies(m, viewer.id, await readJson(req, policiesSchema.partial()));
  await markOnboardingStep(m.businessId, "policies");
  return { ok: true };
});
