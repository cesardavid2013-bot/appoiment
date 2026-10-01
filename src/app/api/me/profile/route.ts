import { readJson, route } from "@/server/http";
import { getAccount, profileSchema, updateProfile } from "@/server/services/account";

export const GET = route({ auth: true }, async ({ viewer }) => {
  const a = await getAccount(viewer.id);
  return { name: a.name, email: a.email, phone: a.phone, timezone: a.timezone, avatar: a.avatar };
});

export const PATCH = route({ auth: true }, async ({ req, viewer }) => {
  return updateProfile(viewer, await readJson(req, profileSchema));
});
