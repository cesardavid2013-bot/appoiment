import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE } from "@/i18n/locales";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { readJson, route } from "@/server/http";

const schema = z.object({ locale: z.string().refine(isLocale, "Unsupported language.") });

/** Sets the interface language for this device and, when signed in, for the account (emails, notifications). */
export const POST = route(async ({ req, viewer }) => {
  const { locale } = await readJson(req, schema);
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  if (viewer) await db.update(users).set({ locale }).where(eq(users.id, viewer.id));
  return { locale };
});
