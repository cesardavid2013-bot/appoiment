import { z } from "zod";
import { requireAdmin } from "@/server/authz";
import { route } from "@/server/http";
import { retryJob } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: true }, async ({ viewer, params }) => {
  requireAdmin(viewer);
  return retryJob(viewer, z.coerce.number().int().positive("Invalid job id").parse(params.id));
});
