import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { archiveForm, formSchema, saveForm } from "@/server/services/forms-admin";

export const PUT = proRoute<{ id: string }>("services.manage", async ({ req, viewer, m, params }) => saveForm(m, viewer.id, await readJson(req, formSchema), z.string().uuid().parse(params.id)));
export const DELETE = proRoute<{ id: string }>("services.manage", async ({ viewer, m, params }) => {
  const res = await archiveForm(m, viewer.id, z.string().uuid().parse(params.id));
  return { ok: true, ...res };
});
