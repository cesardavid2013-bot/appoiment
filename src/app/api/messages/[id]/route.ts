import { z } from "zod";
import { getActiveMembership } from "@/server/authz";
import { readJson, readQuery, route } from "@/server/http";
import { businessSend, customerSend, getThread, sendMessageSchema } from "@/server/services/messaging";

export const GET = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  const { after, before } = readQuery(req, z.object({ after: z.string().datetime().optional(), before: z.string().datetime().optional() }));
  const membership = await getActiveMembership(viewer);
  return getThread({ conversationId: z.string().uuid().parse(params.id), viewer, membership, after: after ? new Date(after) : undefined, before: before ? new Date(before) : undefined });
});

/** Reply in a thread from whichever side the viewer is on. */
export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  const id = z.string().uuid().parse(params.id);
  const input = await readJson(req, sendMessageSchema);
  const membership = await getActiveMembership(viewer);
  const thread = await getThread({ conversationId: id, viewer, membership, after: new Date() });
  if (thread.side === "customer") return customerSend(viewer, thread.businessId, input);
  return businessSend(membership!, viewer.id, id, input);
});
