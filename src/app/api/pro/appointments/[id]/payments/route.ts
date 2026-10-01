import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { recordManualPayment, recordPaymentSchema } from "@/server/services/payments";

export const POST = proRoute<{ id: string }>("payments.refund", async ({ req, viewer, m, params }) => {
  const p = await recordManualPayment(viewer.id, m.businessId, z.string().uuid().parse(params.id), await readJson(req, recordPaymentSchema));
  return { id: p.id };
});
