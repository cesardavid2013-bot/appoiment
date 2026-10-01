import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { updateCustomer, updateCustomerSchema } from "@/server/services/pro";

export const PUT = proRoute<{ id: string }>("customers.manage", async ({ req, viewer, m, params }) => {
  await updateCustomer(m, viewer.id, z.string().uuid().parse(params.id), await readJson(req, updateCustomerSchema));
  return { ok: true };
});
