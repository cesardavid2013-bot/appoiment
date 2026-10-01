import { proRoute, readJson } from "@/server/http";
import { markOnboardingStep, profilePatchSchema, updateProfile } from "@/server/services/business";

export const PUT = proRoute("business.manage", async ({ req, viewer, m }) => {
  await updateProfile(m, viewer.id, await readJson(req, profilePatchSchema));
  await markOnboardingStep(m.businessId, "branding");
  return { ok: true };
});
