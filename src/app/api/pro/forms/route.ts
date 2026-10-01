import { proRoute, readJson } from "@/server/http";
import { formSchema, saveForm } from "@/server/services/forms-admin";

export const POST = proRoute("services.manage", async ({ req, viewer, m }) => saveForm(m, viewer.id, await readJson(req, formSchema)));
