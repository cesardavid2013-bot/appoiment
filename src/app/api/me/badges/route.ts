import { getActiveMembership } from "@/server/authz";
import { route } from "@/server/http";
import { unreadNotificationCount } from "@/server/services/engagement";
import { unreadMessageCount } from "@/server/services/messaging";

export const GET = route(async ({ viewer }) => {
  if (!viewer) return { notifications: 0, messages: 0 };
  const m = await getActiveMembership(viewer);
  const [notifications, messages] = await Promise.all([unreadNotificationCount(viewer.id), unreadMessageCount(viewer, m)]);
  return { notifications, messages };
});
