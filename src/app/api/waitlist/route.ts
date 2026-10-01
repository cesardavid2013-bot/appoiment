import { readJson, route } from "@/server/http";
import { joinWaitlist, waitlistSchema } from "@/server/services/engagement";

export const POST = route({ auth: true }, async ({ req, viewer }) => joinWaitlist(viewer, await readJson(req, waitlistSchema)));
