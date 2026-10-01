import { proRoute, readJson } from "@/server/http";
import { startSpotlight, startSpotlightSchema } from "@/server/services/spotlight";

export const POST = proRoute("promotions.manage", async ({ req, viewer, m }) => startSpotlight(m, viewer.id, await readJson(req, startSpotlightSchema)));
