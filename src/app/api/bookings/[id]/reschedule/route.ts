import { z } from "zod";
import { readJson, route } from "@/server/http";
import { reschedule, rescheduleSchema } from "@/server/services/booking";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) =>
  reschedule({ type: "customer", userId: viewer.id }, z.string().uuid().parse(params.id), await readJson(req, rescheduleSchema)),
);
