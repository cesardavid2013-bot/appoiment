import { readJson, route } from "@/server/http";
import { createReview, reviewSchema } from "@/server/services/engagement";

export const POST = route({ auth: true }, async ({ req, viewer }) => createReview(viewer, await readJson(req, reviewSchema)));
