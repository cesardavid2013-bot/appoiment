import { route } from "@/server/http";
import { resendVerification } from "@/server/services/auth";

export const POST = route({ auth: true }, async ({ viewer }) => {
  await resendVerification(viewer);
  return { ok: true };
});
