import { proRoute, readJson } from "@/server/http";
import { markOnboardingStep } from "@/server/services/business";
import { locationSchema, saveLocation } from "@/server/services/locations";

export const POST = proRoute("locations.manage", async ({ req, viewer, m }) => {
  const res = await saveLocation(m, viewer.id, await readJson(req, locationSchema));
  await markOnboardingStep(m.businessId, "location");
  return res;
});
