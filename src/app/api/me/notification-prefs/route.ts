import { readJson, route } from "@/server/http";
import { notificationPrefsSchema, updateNotificationPrefs } from "@/server/services/account";

export const PUT = route({ auth: true }, async ({ req, viewer }) => {
  return { prefs: await updateNotificationPrefs(viewer, await readJson(req, notificationPrefsSchema)) };
});
