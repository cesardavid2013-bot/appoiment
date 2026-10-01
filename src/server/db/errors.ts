/** Postgres error helpers. Drizzle may wrap driver errors, so we look through `cause`. */
export function pgErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export const isExclusionViolation = (err: unknown) => pgErrorCode(err) === "23P01";
export const isUniqueViolation = (err: unknown) => pgErrorCode(err) === "23505";
