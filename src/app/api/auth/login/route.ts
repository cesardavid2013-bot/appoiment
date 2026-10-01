import { readJson, route } from "@/server/http";
import { login, loginSchema } from "@/server/services/auth";

export const POST = route(async ({ req }) => login(await readJson(req, loginSchema)));
