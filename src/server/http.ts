import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { AppError, unauthenticated } from "@/domain/errors";
import { getViewer, type Viewer } from "./auth/session";
import { env } from "./env";
import { log } from "./logger";
import { randomToken } from "./crypto";

export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string>; requestId?: string } };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cookie-authenticated mutations must come from our own origin. Combined with
 * SameSite=Lax cookies and JSON-only bodies this closes CSRF.
 */
function assertSameOrigin(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(env.APP_URL).origin, req.nextUrl.origin]);
  if (origin) {
    if (!allowed.has(origin)) throw new AppError("forbidden", "This request was blocked for your security.");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AppError("forbidden", "This request was blocked for your security.");
}

export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function errorResponse(err: unknown, requestId = randomToken(6)): NextResponse<ApiErrorBody> {
  if (err instanceof AppError) {
    if (err.status >= 500) log.error("api.app_error", { requestId, code: err.code, message: err.message, details: err.details });
    return NextResponse.json(
      { error: { code: err.code, message: err.message, fields: err.fields, requestId } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation", message: "Please check the highlighted fields.", fields: zodFields(err), requestId } },
      { status: 422 },
    );
  }
  log.error("api.unhandled", { requestId, err });
  return NextResponse.json(
    { error: { code: "internal", message: "Something went wrong on our side. Please try again in a moment.", requestId } },
    { status: 500 },
  );
}

type RouteCtx<P> = { params: Promise<P> };

type HandlerArgs<P> = { req: NextRequest; params: P; viewer: Viewer | null };
type AuthedArgs<P> = { req: NextRequest; params: P; viewer: Viewer };

export function route<P = Record<string, string>>(
  fn: (args: HandlerArgs<P>) => Promise<unknown>,
): (req: NextRequest, ctx: RouteCtx<P>) => Promise<Response>;
export function route<P = Record<string, string>>(
  opts: { auth: true },
  fn: (args: AuthedArgs<P>) => Promise<unknown>,
): (req: NextRequest, ctx: RouteCtx<P>) => Promise<Response>;
export function route<P>(a: unknown, b?: unknown) {
  const opts = (typeof a === "function" ? {} : a) as { auth?: boolean };
  const fn = (typeof a === "function" ? a : b) as (args: HandlerArgs<P>) => Promise<unknown>;
  return async (req: NextRequest, ctx: RouteCtx<P>) => {
    try {
      assertSameOrigin(req);
      const viewer = await getViewer();
      if (opts.auth && !viewer) throw unauthenticated();
      const result = await fn({ req, params: await ctx.params, viewer });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null }, { headers: { "cache-control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson<T extends ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new AppError("bad_request", "Expected a JSON request body.");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("bad_request", "The request body couldn't be read.");
  }
  return schema.parse(raw);
}

export function readQuery<T extends ZodType>(req: NextRequest, schema: T): z.infer<T> {
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of req.nextUrl.searchParams) {
    const existing = obj[k];
    obj[k] = existing === undefined ? v : Array.isArray(existing) ? [...existing, v] : [existing, v];
  }
  return schema.parse(obj);
}

/** Common validators */
export const zId = z.string().uuid("Invalid id");
export const zIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const zText = (max: number) => z.string().trim().max(max);
export const zOptText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
