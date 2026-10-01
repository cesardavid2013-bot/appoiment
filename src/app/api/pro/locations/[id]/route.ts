import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { deactivateLocation, locationSchema, saveLocation } from "@/server/services/locations";

export const PUT = proRoute<{ id: string }>("locations.manage", async ({ req, viewer, m, params }) => saveLocation(m, viewer.id, await readJson(req, locationSchema), z.string().uuid().parse(params.id)));
export const DELETE = proRoute<{ id: string }>("locations.manage", async ({ viewer, m, params }) => {
  await deactivateLocation(m, viewer.id, z.string().uuid().parse(params.id));
  return { ok: true };
});
