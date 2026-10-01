/** Typed application errors. Messages are written for end users; details are for logs. */
export type ErrorCode =
  | "bad_request"
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "slot_unavailable"
  | "rate_limited"
  | "payment_failed"
  | "unavailable"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  slot_unavailable: 409,
  rate_limited: 429,
  payment_failed: 402,
  unavailable: 503,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, opts: { fields?: Record<string, string>; details?: unknown } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fields = opts.fields;
    this.details = opts.details;
  }
}

export const notFound = (what = "That page") => new AppError("not_found", `${what} couldn't be found.`);
export const forbidden = (msg = "You don't have access to do that.") => new AppError("forbidden", msg);
export const unauthenticated = () => new AppError("unauthenticated", "Please sign in to continue.");
