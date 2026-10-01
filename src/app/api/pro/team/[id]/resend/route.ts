import { z } from "zod";
import { proRoute } from "@/server/http";
import { resendInvite } from "@/server/services/team";

export const POST = proRoute<{ id: string }>("team.manage", async ({ viewer, m, params }) => {
  await resendInvite(m, viewer, z.string().uuid().parse(params.id));
  return { ok: true };
});
