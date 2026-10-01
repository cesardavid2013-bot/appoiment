import { proRoute, readJson } from "@/server/http";
import { inviteMember, inviteSchema } from "@/server/services/team";

export const POST = proRoute("team.manage", async ({ req, viewer, m }) => inviteMember(m, viewer, await readJson(req, inviteSchema)));
