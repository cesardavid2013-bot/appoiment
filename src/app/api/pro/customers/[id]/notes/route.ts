import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { addCustomerNote } from "@/server/services/pro";

export const POST = proRoute<{ id: string }>("customers.manage", async ({ req, viewer, m, params }) => addCustomerNote(m, viewer.id, z.string().uuid().parse(params.id), (await readJson(req, z.object({ body: z.string().max(2000) }))).body));
