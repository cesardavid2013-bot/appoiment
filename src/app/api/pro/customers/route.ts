import { z } from "zod";
import { proRoute, readQuery } from "@/server/http";
import { customerQuerySchema, listCustomers, searchCustomers } from "@/server/services/pro";

export const GET = proRoute(["customers.view", "appointments.manage_all"], async ({ req, m }) => {
  const q = readQuery(req, customerQuerySchema.extend({ lookup: z.string().max(100).optional() }));
  if (q.lookup != null) return searchCustomers(m, q.lookup);
  return listCustomers(m, q);
});
