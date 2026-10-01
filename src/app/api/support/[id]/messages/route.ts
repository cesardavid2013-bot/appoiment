import { readJson, route, zId } from "@/server/http";
import { replySchema, replyToTicket } from "@/server/services/support";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  return replyToTicket(viewer, zId.parse(params.id), await readJson(req, replySchema));
});
