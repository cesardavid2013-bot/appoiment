import { readJson, route } from "@/server/http";
import { changePassword, changePasswordSchema } from "@/server/services/account";

export const POST = route({ auth: true }, async ({ req, viewer }) => {
  return changePassword(viewer, await readJson(req, changePasswordSchema));
});
