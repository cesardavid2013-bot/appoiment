import { z } from "zod";
import { readJson, route, zId } from "@/server/http";
import { customerSend, listCustomerConversations, sendMessageSchema } from "@/server/services/messaging";

export const GET = route({ auth: true }, async ({ viewer }) => listCustomerConversations(viewer));

/** Start or continue a conversation with a business. */
export const POST = route({ auth: true }, async ({ req, viewer }) => {
  const input = await readJson(req, sendMessageSchema.extend({ businessId: zId }));
  return customerSend(viewer, input.businessId, input);
});
