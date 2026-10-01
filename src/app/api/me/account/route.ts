import { destroyCurrentSession } from "@/server/auth/session";
import { readJson, route } from "@/server/http";
import { deleteAccount, deleteAccountSchema, deletionCheck } from "@/server/services/account";

/** What would block or be affected by deleting the account. */
export const GET = route({ auth: true }, async ({ viewer }) => deletionCheck(viewer.id));

export const DELETE = route({ auth: true }, async ({ req, viewer }) => {
  const result = await deleteAccount(viewer, await readJson(req, deleteAccountSchema));
  await destroyCurrentSession();
  return result;
});
