import { proRoute } from "@/server/http";
import { createOnboardingLink } from "@/server/services/payments";

export const POST = proRoute("business.manage", async ({ m }) => createOnboardingLink(m.businessId));
