import { z } from "zod";
import { route } from "@/server/http";
import { getCustomerAppointment } from "@/server/services/booking";
import { startCheckout } from "@/server/services/payments";

/** Resume checkout for an approved request or an interrupted payment. */
export const POST = route<{ id: string }>({ auth: true }, async ({ viewer, params }) => {
  const a = await getCustomerAppointment(viewer, z.string().uuid().parse(params.id));
  return startCheckout(a.id);
});
