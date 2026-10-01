"use client";

import type { MediaLike } from "@/components/ui/media";

export type UploadResult = { id: string; status: "processing" | "ready" | "failed"; kind: "image" | "video"; media: MediaLike | null };

const MAX_EDGE = 2400;

/** Re-encode very large photos on-device before uploading (keeps uploads fast on weak networks). */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. HEIC on browsers that can't decode it — let the server decide
  }
}

/** Uploads one file with progress. Rejects with a human-readable message. */
export async function uploadMedia(file: File, opts: { purpose: string; businessId?: string | null; onProgress?: (pct: number) => void; alt?: string }): Promise<UploadResult> {
  const isVideo = file.type.startsWith("video/");
  const maxBytes = isVideo ? 150 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(isVideo ? "Videos must be under 150 MB." : "That image is too large.");
  const body = new FormData();
  const data = isVideo ? file : await shrinkImage(file);
  body.set("file", data, data === file ? file.name : `${file.name.replace(/\.[^.]+$/, "")}.jpg`);
  body.set("purpose", opts.purpose);
  if (opts.businessId) body.set("businessId", opts.businessId);
  if (opts.alt) body.set("alt", opts.alt);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const res = xhr.response as { data?: UploadResult; error?: { message: string } } | null;
      if (xhr.status >= 200 && xhr.status < 300 && res?.data) resolve(res.data);
      else reject(new Error(res?.error?.message ?? "The upload didn't finish. Please try again."));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(body);
  });
}
