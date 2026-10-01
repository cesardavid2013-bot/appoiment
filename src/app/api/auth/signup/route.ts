import { readJson, route } from "@/server/http";
import { signup, signupSchema } from "@/server/services/auth";

export const POST = route(async ({ req }) => signup(await readJson(req, signupSchema)));
