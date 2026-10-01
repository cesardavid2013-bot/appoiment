import { route } from "@/server/http";
import { otherSessionCount, signOutOtherDevices } from "@/server/services/account";

export const GET = route({ auth: true }, async ({ viewer }) => ({ others: await otherSessionCount(viewer) }));

/** Signs out every other device; the current session stays signed in. */
export const DELETE = route({ auth: true }, async ({ viewer }) => signOutOtherDevices(viewer));
