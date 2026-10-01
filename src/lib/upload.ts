import type { MediaLike } from "@/components/ui/media";
import { ApiError } from "./api";

export type UploadedMedia = { id: string; status: string; kind: "image" | "video"; media: MediaLike | null };

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Multipart upload to /api/media with the same human error handling as `api()`. */
export async function uploadMedia(file: File, purpose: "avatar" | "support" | "message", opts: { alt?: string; signal?: AbortSignal } = {}): Promise<UploadedMedia> {
  if (!file.type.startsWith("image/")) throw new ApiError("Choose a JPG, PNG or WebP image.", "validation", 422);
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError("Images must be under 15 MB.", "validation", 422);
  const form = new FormData();
  form.set("file", file);
  form.set("purpose", purpose);
  if (opts.alt) form.set("alt", opts.alt);
  let res: Response;
  try {
    res = await fetch("/api/media", { method: "POST", body: form, credentials: "same-origin", signal: opts.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("The upload didn't go through. Check your connection and try again.", "network", 0);
  }
  const json = (await res.json().catch(() => null)) as { data?: UploadedMedia; error?: { code: string; message: string } } | null;
  if (!res.ok || !json?.data) {
    throw new ApiError(json?.error?.message ?? "That upload didn't work. Please try again.", json?.error?.code ?? "internal", res.status);
  }
  return json.data;
}
