import { proRoute, readJson, readQuery, zId } from "@/server/http";
import { businessSend, getThread, sendMessageSchema, threadQuerySchema } from "@/server/services/messaging";

export const GET = proRoute<{ id: string }>("messages.manage", async ({ req, viewer, m, params }) => {
  const { after, before } = readQuery(req, threadQuerySchema);
  return getThread({ conversationId: zId.parse(params.id), viewer, membership: m, as: "business", after, before });
});

export const POST = proRoute<{ id: string }>("messages.manage", async ({ req, viewer, m, params }) => businessSend(m, viewer.id, zId.parse(params.id), await readJson(req, sendMessageSchema)));
