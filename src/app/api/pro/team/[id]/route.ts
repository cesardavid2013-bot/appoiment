import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { disableMember, updateMember, updateMemberSchema } from "@/server/services/team";

export const PUT = proRoute<{ id: string }>(null, async ({ req, viewer, m, params }) => {
  await updateMember(m, viewer.id, z.string().uuid().parse(params.id), await readJson(req, updateMemberSchema));
  return { ok: true };
});
export const DELETE = proRoute<{ id: string }>("team.manage", async ({ viewer, m, params }) => disableMember(m, viewer.id, z.string().uuid().parse(params.id)));
