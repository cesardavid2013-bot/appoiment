import { requireActiveMember } from "@/server/authz";
import { readJson, route } from "@/server/http";
import { getVerificationState, submitVerification, submitVerificationSchema } from "@/server/services/verification";

/** The active business's verification status and latest request. */
export const GET = route({ auth: true }, async ({ viewer }) => {
  const m = await requireActiveMember(viewer, "business.manage");
  return getVerificationState(m.businessId);
});

/** Submits details and documents (media uploaded with purpose "verification") for review. */
export const POST = route({ auth: true }, async ({ req, viewer }) => {
  const m = await requireActiveMember(viewer, "business.manage");
  return submitVerification(m, viewer.id, await readJson(req, submitVerificationSchema));
});
