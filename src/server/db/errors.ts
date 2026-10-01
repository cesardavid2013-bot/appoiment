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
/**
 * Two transactions inserting overlapping rows under an exclusion constraint can
 * each see the other's uncommitted tuple and wait on it; Postgres aborts one with
 * 40P01. For bookings that's simply a lost race for the same time, not a failure.
 */
export const isDeadlock = (err: unknown) => pgErrorCode(err) === "40P01";
/** The other booking won this professional's time (constraint fired, or we lost a deadlock against it). */
export const isTimeConflict = (err: unknown) => isExclusionViolation(err) || isDeadlock(err);
