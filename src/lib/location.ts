/** The user's chosen search location, remembered in a cookie so server pages can personalise. */
export type SavedLocation = { label: string; lat: number; lng: number };
export const LOCATION_COOKIE = "kept_loc";

export function parseLocationCookie(raw: string | undefined | null): SavedLocation | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as SavedLocation;
    if (typeof v.lat === "number" && typeof v.lng === "number" && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180) return { label: String(v.label).slice(0, 80), lat: v.lat, lng: v.lng };
  } catch {
    /* ignore */
  }
  return null;
}

export function saveLocationCookie(loc: SavedLocation | null) {
  if (typeof document === "undefined") return;
  if (!loc) document.cookie = `${LOCATION_COOKIE}=; path=/; max-age=0; samesite=lax`;
  else document.cookie = `${LOCATION_COOKIE}=${encodeURIComponent(JSON.stringify(loc))}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
}
