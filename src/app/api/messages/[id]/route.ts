import { readJson, readQuery, route, zId } from "@/server/http";
import { customerSend, getThread, sendMessageSchema, threadQuerySchema } from "@/server/services/messaging";

/** Customer side of a thread. Business replies go through /api/pro/messages/[id]. */
export const GET = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  const { after, before } = readQuery(req, threadQuerySchema);
  return getThread({ conversationId: zId.parse(params.id), viewer, as: "customer", after, before });
});

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  const id = zId.parse(params.id);
  const input = await readJson(req, sendMessageSchema);
  // Verifies the viewer is the customer in this thread before writing.
  const thread = await getThread({ conversationId: id, viewer, as: "customer", after: new Date().toISOString() });
  return customerSend(viewer, thread.businessId, input);
});
