import { proRoute, readJson } from "@/server/http";
import { markOnboardingStep } from "@/server/services/business";
import { saveService, serviceInputSchema } from "@/server/services/catalog-admin";

export const POST = proRoute("services.manage", async ({ req, viewer, m }) => {
  const res = await saveService(m, viewer.id, await readJson(req, serviceInputSchema));
  await markOnboardingStep(m.businessId, "services");
  return res;
});
