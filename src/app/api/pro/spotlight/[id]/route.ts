import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { setSpotlightStatus, spotlightActionSchema } from "@/server/services/spotlight";

export const POST = proRoute<{ id: string }>("promotions.manage", async ({ req, viewer, m, params }) =>
  setSpotlightStatus(m, viewer.id, z.string().uuid().parse(params.id), (await readJson(req, spotlightActionSchema)).action),
);
