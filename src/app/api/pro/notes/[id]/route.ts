import { z } from "zod";
import { proRoute } from "@/server/http";
import { deleteCustomerNote } from "@/server/services/pro";

export const DELETE = proRoute<{ id: string }>("customers.view", async ({ viewer, m, params }) => {
  await deleteCustomerNote(m, viewer.id, z.string().uuid().parse(params.id));
  return { ok: true };
});
