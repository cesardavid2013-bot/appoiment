"use client";

import { AlertCircle, ArrowLeft, ArrowRight, ImagePlus, MoreHorizontal, Pencil, Star, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Select, Textarea } from "@/components/ui/field";
import { MediaImage, type MediaLike } from "@/components/ui/media";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { api, type ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { uploadMedia } from "@/lib/upload";

export type WorkItem = {
  id: string;
  kind: "image" | "video" | "before_after";
  caption: string | null;
  serviceId: string | null;
  serviceName: string | null;
  serviceBookable: boolean;
  memberId: string | null;
  memberName: string | null;
  isFeatured: boolean;
  media: MediaLike | null;
  before: MediaLike | null;
  mediaStatus: "ready" | "processing" | "failed";
};

type Opt = { id: string; name: string };
type Upload = { key: string; name: string; pct: number; state: "uploading" | "saving" | "done" | "error"; error?: string };

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm";

export function PortfolioManager({ items, businessId, services, team }: { items: WorkItem[]; businessId: string; services: Opt[]; team: Opt[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [synced, setSynced] = useState(items);
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [deleting, setDeleting] = useState<WorkItem | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Keep local order in step with the server after refreshes.
  if (synced !== items) {
    setSynced(items);
    setOrder(items.map((i) => i.id));
  }
  const list = order.map((id) => items.find((i) => i.id === id)).filter((x): x is WorkItem => Boolean(x));
  const processing = items.some((i) => i.mediaStatus === "processing");
  const uploading = uploads.some((u) => u.state === "uploading" || u.state === "saving");

  // Videos are encoded in the background; check back until they're ready.
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [processing, router]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const batch = [...files].slice(0, 20).map((f, i) => ({ file: f, key: `${Date.now()}-${i}` }));
    setUploads((u) => [...u.filter((x) => x.state !== "done"), ...batch.map((b) => ({ key: b.key, name: b.file.name, pct: 0, state: "uploading" as const }))]);
    const patch = (key: string, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));
    let ok = 0;
    // Two at a time keeps phones responsive on slow connections.
    const queue = [...batch];
    async function worker() {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { file, key } = next;
        try {
          const res = await uploadMedia(file, { purpose: "portfolio", businessId, onProgress: (pct) => patch(key, { pct }) });
          patch(key, { state: "saving", pct: 100 });
          await api("/api/pro/portfolio", { body: { mediaId: res.id } });
          patch(key, { state: "done" });
          ok++;
        } catch (err) {
          patch(key, { state: "error", error: (err as Error).message });
        }
      }
    }
    await Promise.all([worker(), worker()]);
    if (fileRef.current) fileRef.current.value = "";
    if (ok) {
      toast.success(`${ok} ${ok === 1 ? "item" : "items"} added to your portfolio`);
      router.refresh();
    }
  }

  async function move(item: WorkItem, dir: -1 | 1) {
    const i = order.indexOf(item.id);
    const j = i + dir;
    const neighbour = list[j];
    if (!neighbour || neighbour.isFeatured !== item.isFeatured) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    const prev = order;
    setOrder(next);
    try {
      await api("/api/pro/portfolio/reorder", { body: { ids: next } });
    } catch (err) {
      setOrder(prev);
      toast.error((err as ApiError).message);
      router.refresh();
    }
  }

  async function toggleFeatured(item: WorkItem) {
    try {
      await api(`/api/pro/portfolio/${item.id}`, { method: "PUT", body: { isFeatured: !item.isFeatured } });
      toast.success(item.isFeatured ? "Removed from featured" : "Featured — it now shows first on your profile");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/pro/portfolio/${deleting.id}`, { method: "DELETE" });
      toast.success("Removed from your portfolio");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const featuredCount = list.filter((i) => i.isFeatured).length;

  return (
    <div>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => addFiles(e.target.files)} />
      <div className="flex flex-wrap gap-2">
        <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()} disabled={uploading}>
          Add photos or videos
        </Button>
        <Button variant="secondary" icon={<ImagePlus className="size-4" />} onClick={() => setPairOpen(true)} disabled={uploading}>
          Before &amp; after
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-ink-3">Photos (JPG, PNG, WebP) and videos (MP4, MOV, up to 3 minutes). You can select several at once.</p>

      {uploads.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface" aria-live="polite" aria-label="Uploads">
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">{u.name}</span>
              {u.state === "error" ? (
                <span className="flex items-center gap-1.5 text-[13px] text-danger">
                  <AlertCircle className="size-4 shrink-0" /> {u.error}
                </span>
              ) : u.state === "done" ? (
                <span className="text-[13px] text-accent-text">Added</span>
              ) : (
                <span className="flex w-40 items-center gap-2">
                  <span
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
                    role="progressbar"
                    aria-valuenow={u.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${u.name}`}
                  >
                    <span className="block h-full bg-accent transition-[width]" style={{ width: `${u.pct}%` }} />
                  </span>
                  <span className="w-12 text-end text-[12px] text-ink-3 tabular">{u.state === "saving" ? "Saving" : `${u.pct}%`}</span>
                </span>
              )}
            </li>
          ))}
          {!uploading && (
            <li className="flex justify-end px-3 py-2">
              <button type="button" className="h-8 rounded-md px-2 text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => setUploads([])}>
                Clear list
              </button>
            </li>
          )}
        </ul>
      )}

      {list.length === 0 ? (
        uploading ? null : (
          <div className="mt-8 rounded-lg border border-dashed border-line-strong">
            <EmptyState
              icon={<ImagePlus />}
              title="Show people your work"
              description="Customers look at past work before they book. Add a few recent pieces and link each one to a service so they can tap “Book this”."
              action={
                <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
                  Upload your first photos
                </Button>
              }
            />
          </div>
        )
      ) : (
        <>
          <p className="mt-8 text-[13px] text-ink-3">
            {list.length} {list.length === 1 ? "piece" : "pieces"}
            {featuredCount > 0 && ` · ${featuredCount} featured`} · Shown on your profile in this order{list.length > 4 ? ", with the first one large" : ""}.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((item, idx) => {
              const canEarlier = idx > 0 && list[idx - 1].isFeatured === item.isFeatured;
              const canLater = idx < list.length - 1 && list[idx + 1].isFeatured === item.isFeatured;
              const label = item.caption ?? (item.serviceName ? `${item.serviceName} photo` : `Portfolio item ${idx + 1}`);
              return (
                <li key={item.id} className="group min-w-0">
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
                    <button type="button" onClick={() => setEditing(item)} className="absolute inset-0 block size-full" aria-label={`Edit ${label}`}>
                      {item.media ? (
                        item.kind === "before_after" && item.before ? (
                          <span className="grid size-full grid-cols-2 gap-px bg-line">
                            <MediaImage media={item.before} alt="" sizes="(min-width: 1024px) 12vw, 25vw" className="size-full" />
                            <MediaImage media={item.media} alt="" sizes="(min-width: 1024px) 12vw, 25vw" className="size-full" />
                          </span>
                        ) : (
                          <MediaImage media={item.media} alt={item.caption ?? ""} sizes="(min-width: 1024px) 22vw, 45vw" className="size-full" />
                        )
                      ) : item.mediaStatus === "processing" ? (
                        <span className="flex size-full flex-col items-center justify-center gap-2 px-3 text-center text-[13px] text-ink-3">
                          <Spinner className="size-5" />
                          Processing video…
                          <span className="text-[12px]">It appears on your profile when ready.</span>
                        </span>
                      ) : (
                        <span className="flex size-full flex-col items-center justify-center gap-1.5 px-3 text-center text-[13px] text-danger">
                          <AlertCircle className="size-5" />
                          Couldn&apos;t process this file
                          <span className="text-[12px] text-ink-3">Delete it and try exporting as MP4.</span>
                        </span>
                      )}
                    </button>
                    <span className="pointer-events-none absolute start-2 top-2 flex gap-1">
                      {item.isFeatured && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">Featured</span>}
                      {item.kind === "video" && item.media && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">Video</span>}
                      {item.kind === "before_after" && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">Before / after</span>}
                    </span>
                    <Menu>
                      <MenuTrigger
                        className="absolute end-1.5 top-1.5 flex size-9 items-center justify-center rounded-md bg-surface/90 text-ink shadow-sm hover:bg-surface"
                        aria-label={`Actions for ${label}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<Pencil />} onSelect={() => setEditing(item)}>
                          Edit details
                        </MenuItem>
                        <MenuItem icon={<Star />} onSelect={() => toggleFeatured(item)}>
                          {item.isFeatured ? "Unfeature" : "Feature"}
                        </MenuItem>
                        {canEarlier && (
                          <MenuItem icon={<ArrowLeft />} onSelect={() => move(item, -1)}>
                            Move earlier
                          </MenuItem>
                        )}
                        {canLater && (
                          <MenuItem icon={<ArrowRight />} onSelect={() => move(item, 1)}>
                            Move later
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(item)}>
                          Delete
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                  <div className="mt-2 min-w-0 px-0.5">
                    <p className={cn("truncate text-[13px]", item.caption ? "text-ink" : "text-ink-3")}>{item.caption ?? "No caption"}</p>
                    <p className="truncate text-[12px] text-ink-3">
                      {item.serviceName ? (item.serviceBookable ? `Book this: ${item.serviceName}` : `${item.serviceName} (not bookable)`) : "Not linked to a service"}
                      {item.memberName ? ` · ${item.memberName}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editing && <EditDialog key={editing.id} item={editing} services={services} team={team} onClose={() => setEditing(null)} />}
      {pairOpen && <BeforeAfterDialog businessId={businessId} services={services} onClose={() => setPairOpen(false)} />}
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this from your portfolio?"
        description="It's removed from your public profile right away. This can't be undone."
        confirmLabel="Delete"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}

function EditDialog({ item, services, team, onClose }: { item: WorkItem; services: Opt[]; team: Opt[]; onClose: () => void }) {
  const router = useRouter();
  const [caption, setCaption] = useState(item.caption ?? "");
  const [serviceId, setServiceId] = useState(item.serviceId ?? "");
  const [memberId, setMemberId] = useState(item.memberId ?? "");
  const [featured, setFeatured] = useState(item.isFeatured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/pro/portfolio/${item.id}`, { method: "PUT", body: { caption: caption.trim() || null, serviceId: serviceId || null, memberId: memberId || null, isFeatured: featured } });
      toast.success("Saved");
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit details"
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="work-form" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="work-form" onSubmit={save} className="space-y-4">
        {item.media && item.kind !== "before_after" && <MediaImage media={item.media} alt="" sizes="480px" fit="contain" className="h-48 w-full rounded-md" />}
        <FormError message={error} />
        <Field label="Caption" optional hint="What was done — e.g. “Mid skin fade with a textured crop”.">
          {(p) => <Textarea {...p} rows={2} maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} />}
        </Field>
        <Field label="Service" optional hint="Customers see a “Book this” button that opens this service.">
          {(p) => (
            <Select {...p} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">None</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {team.length > 1 && (
          <Field label="Done by" optional>
            {(p) => (
              <Select {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Not specified</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Switch checked={featured} onCheckedChange={setFeatured} label="Feature this" description="Featured work shows first on your profile." />
      </form>
    </Dialog>
  );
}

function PickImage({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => void (urlRef.current && URL.revokeObjectURL(urlRef.current)), []);
  function choose(f: File | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = f ? URL.createObjectURL(f) : null;
    setUrl(urlRef.current);
    onPick(f);
  }
  return (
    <div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => choose(e.target.files?.[0] ?? null)} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-dashed border-line-strong bg-surface-2 text-sm text-ink-2 hover:border-ink-3"
        aria-label={file ? `${label}: ${file.name}. Choose a different photo` : `Choose ${label.toLowerCase()} photo`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {file && url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" /> : <ImagePlus className="size-5 text-ink-3" />}
        {!file && <span>Choose photo</span>}
        <span className="absolute start-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{label}</span>
      </button>
    </div>
  );
}

function BeforeAfterDialog({ businessId, services, onClose }: { businessId: string; services: Opt[]; onClose: () => void }) {
  const router = useRouter();
  const [before, setBefore] = useState<File | null>(null);
  const [after, setAfter] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!before || !after) {
      setError("Choose both a before and an after photo.");
      return;
    }
    setError(null);
    try {
      setProgress("Uploading before photo…");
      const b = await uploadMedia(before, { purpose: "portfolio", businessId, onProgress: (p) => setProgress(`Uploading before photo… ${p}%`) });
      setProgress("Uploading after photo…");
      const a = await uploadMedia(after, { purpose: "portfolio", businessId, onProgress: (p) => setProgress(`Uploading after photo… ${p}%`) });
      setProgress("Saving…");
      await api("/api/pro/portfolio", { body: { mediaId: a.id, beforeMediaId: b.id, caption: caption.trim() || null, serviceId: serviceId || null } });
      toast.success("Before & after added");
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    }
  }

  const busy = progress != null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a before & after"
      description="Customers drag a slider to compare the two photos. Use the same angle and lighting if you can."
      locked={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Add to portfolio
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <PickImage label="Before" file={before} onPick={setBefore} />
          <PickImage label="After" file={after} onPick={setAfter} />
        </div>
        <FormError message={error} />
        {progress && (
          <p className="text-[13px] text-ink-3" aria-live="polite">
            {progress}
          </p>
        )}
        <Field label="Caption" optional>
          {(p) => <Textarea {...p} rows={2} maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} />}
        </Field>
        <Field label="Service" optional hint="Adds a “Book this” button on your profile.">
          {(p) => (
            <Select {...p} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">None</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}
