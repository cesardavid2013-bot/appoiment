import { z } from "zod";
import { readJson, route, zOptText } from "@/server/http";
import { customerCancel } from "@/server/services/booking";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  const { reason } = await readJson(req, z.object({ reason: zOptText(500) }));
  return customerCancel(viewer, z.string().uuid().parse(params.id), reason);
});
