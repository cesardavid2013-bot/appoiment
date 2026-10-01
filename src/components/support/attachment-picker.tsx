"use client";

import { ImagePlus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { MediaImage, type MediaLike } from "@/components/ui/media";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { uploadMedia } from "@/lib/upload";

export type Attachment = { key: string; id: string | null; media: MediaLike | null; preview: string; name: string };

/** Image attachments uploaded as soon as they're picked, with previews and removal. */
export function AttachmentPicker({ value, onChange, max, disabled }: { value: Attachment[]; onChange: (next: Attachment[] | ((prev: Attachment[]) => Attachment[])) => void; max: number; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [busy, setBusy] = useState(0);
  const remaining = max - value.length;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = [...files].slice(0, remaining);
    if (files.length > remaining) toast.error(`You can attach up to ${max} images.`);
    if (inputRef.current) inputRef.current.value = "";
    const drafts = picked.map((f) => ({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`, id: null, media: null, preview: URL.createObjectURL(f), name: f.name }));
    onChange((prev) => [...prev, ...drafts]);
    setBusy((n) => n + picked.length);
    await Promise.all(
      picked.map(async (file, i) => {
        const key = drafts[i].key;
        try {
          const up = await uploadMedia(file, { purpose: "support", alt: "Support attachment" });
          onChange((prev) => prev.map((a) => (a.key === key ? { ...a, id: up.id, media: up.media } : a)));
        } catch (err) {
          toast.error(`${file.name}: ${(err as ApiError).message}`);
          onChange((prev) => prev.filter((a) => a.key !== key));
        } finally {
          setBusy((n) => n - 1);
        }
      }),
    );
  }

  return (
    <div className="relative">
      <ul className="flex flex-wrap gap-2" aria-label="Attachments">
        {value.map((a) => (
          <li key={a.key} className="relative size-20 overflow-hidden rounded-lg border border-line bg-surface-2">
            {a.media ? (
              <MediaImage media={a.media} alt={a.name} sizes="80px" className="size-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.preview} alt={a.name} className="size-full object-cover opacity-60" />
            )}
            {!a.id && (
              <span className="absolute inset-0 flex items-center justify-center text-ink">
                <Spinner className="size-5" label={`Uploading ${a.name}`} />
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange((prev) => prev.filter((x) => x.key !== a.key))}
              disabled={disabled}
              className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm hover:bg-surface"
              aria-label={`Remove ${a.name}`}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
        {remaining > 0 && (
          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              aria-describedby={hintId}
              className={cn("flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-[12px] font-medium text-ink-3 transition-colors hover:border-ink-3 hover:text-ink", disabled && "opacity-50")}
            >
              <ImagePlus className="size-5" aria-hidden />
              Add image
            </button>
          </li>
        )}
      </ul>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFiles(e.target.files)} />
      <p id={hintId} className="mt-2 text-[13px] text-ink-3" aria-live="polite">
        {busy > 0 ? `Uploading ${busy} ${busy === 1 ? "image" : "images"}…` : `Screenshots or photos help. Up to ${max} images, 15 MB each.`}
      </p>
    </div>
  );
}
