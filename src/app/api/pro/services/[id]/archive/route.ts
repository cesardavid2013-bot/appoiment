import { z } from "zod";
import { proRoute } from "@/server/http";
import { archiveService } from "@/server/services/catalog-admin";

export const POST = proRoute<{ id: string }>("services.manage", async ({ viewer, m, params }) => archiveService(m, viewer.id, z.string().uuid().parse(params.id)));
