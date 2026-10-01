import "server-only";

/**
 * Wall-clock time for server rendering. Server components render once per
 * request, so reading the clock here is deterministic for that render.
 */
export function requestNow(): number {
  return Date.now();
}
