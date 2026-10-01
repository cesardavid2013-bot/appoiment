import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { getServiceForEdit, saveService, serviceInputSchema } from "@/server/services/catalog-admin";

export const GET = proRoute<{ id: string }>("services.manage", async ({ m, params }) => getServiceForEdit(m.businessId, z.string().uuid().parse(params.id)));
export const PUT = proRoute<{ id: string }>("services.manage", async ({ req, viewer, m, params }) => saveService(m, viewer.id, await readJson(req, serviceInputSchema), z.string().uuid().parse(params.id)));
