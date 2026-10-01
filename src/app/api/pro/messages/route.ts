import { proRoute, readJson, readQuery, zId } from "@/server/http";
import { businessStart, inboxQuerySchema, listBusinessConversations, sendMessageSchema } from "@/server/services/messaging";

export const GET = proRoute("messages.manage", async ({ req, m }) => listBusinessConversations(m, readQuery(req, inboxQuerySchema)));

/** First message to a client who has booked with this business. */
export const POST = proRoute("messages.manage", async ({ req, viewer, m }) => {
  const input = await readJson(req, sendMessageSchema.extend({ customerId: zId }));
  return businessStart(m, viewer.id, input.customerId, input);
});
