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
import { useT } from "@/i18n/client";
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
  const t = useT("proSetup");
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
    const timer = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(timer);
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
      toast.success(t("portfolio.added", { count: ok }));
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
      toast.success(item.isFeatured ? t("portfolio.unfeatured") : t("portfolio.featuredToast"));
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
      toast.success(t("portfolio.removed"));
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
          {t("portfolio.add")}
        </Button>
        <Button variant="secondary" icon={<ImagePlus className="size-4" />} onClick={() => setPairOpen(true)} disabled={uploading}>
          {t("portfolio.beforeAfter")}
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-ink-3">{t("portfolio.formats")}</p>

      {uploads.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface" aria-live="polite" aria-label={t("portfolio.uploads")}>
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">{u.name}</span>
              {u.state === "error" ? (
                <span className="flex items-center gap-1.5 text-[13px] text-danger">
                  <AlertCircle className="size-4 shrink-0" /> {u.error}
                </span>
              ) : u.state === "done" ? (
                <span className="text-[13px] text-accent-text">{t("portfolio.uploadAdded")}</span>
              ) : (
                <span className="flex w-40 items-center gap-2">
                  <span
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
                    role="progressbar"
                    aria-valuenow={u.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t("portfolio.uploading", { name: u.name })}
                  >
                    <span className="block h-full bg-accent transition-[width]" style={{ width: `${u.pct}%` }} />
                  </span>
                  <span className="w-12 text-end text-[12px] text-ink-3 tabular">{u.state === "saving" ? t("portfolio.saving") : `${u.pct}%`}</span>
                </span>
              )}
            </li>
          ))}
          {!uploading && (
            <li className="flex justify-end px-3 py-2">
              <button type="button" className="h-8 rounded-md px-2 text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => setUploads([])}>
                {t("portfolio.clearList")}
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
              title={t("portfolio.emptyTitle")}
              description={t("portfolio.emptyBody")}
              action={
                <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
                  {t("portfolio.emptyAction")}
                </Button>
              }
            />
          </div>
        )
      ) : (
        <>
          <p className="mt-8 text-[13px] text-ink-3">
            {t("portfolio.pieces", { count: list.length })}
            {featuredCount > 0 && ` · ${t("portfolio.featuredCount", { count: featuredCount })}`} · {list.length > 4 ? t("portfolio.orderLarge") : t("portfolio.order")}
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((item, idx) => {
              const canEarlier = idx > 0 && list[idx - 1].isFeatured === item.isFeatured;
              const canLater = idx < list.length - 1 && list[idx + 1].isFeatured === item.isFeatured;
              const label = item.caption ?? (item.serviceName ? t("portfolio.servicePhoto", { name: item.serviceName }) : t("portfolio.itemN", { n: idx + 1 }));
              return (
                <li key={item.id} className="group min-w-0">
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
                    <button type="button" onClick={() => setEditing(item)} className="absolute inset-0 block size-full" aria-label={t("portfolio.editItem", { label })}>
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
                          {t("portfolio.processing")}
                          <span className="text-[12px]">{t("portfolio.processingHint")}</span>
                        </span>
                      ) : (
                        <span className="flex size-full flex-col items-center justify-center gap-1.5 px-3 text-center text-[13px] text-danger">
                          <AlertCircle className="size-5" />
                          {t("portfolio.failed")}
                          <span className="text-[12px] text-ink-3">{t("portfolio.failedHint")}</span>
                        </span>
                      )}
                    </button>
                    <span className="pointer-events-none absolute start-2 top-2 flex gap-1">
                      {item.isFeatured && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("portfolio.featured")}</span>}
                      {item.kind === "video" && item.media && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("portfolio.video")}</span>}
                      {item.kind === "before_after" && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("portfolio.beforeAfterBadge")}</span>}
                    </span>
                    <Menu>
                      <MenuTrigger
                        className="absolute end-1.5 top-1.5 flex size-9 items-center justify-center rounded-md bg-surface/90 text-ink shadow-sm hover:bg-surface"
                        aria-label={t("portfolio.actionsFor", { label })}
                      >
                        <MoreHorizontal className="size-4" />
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<Pencil />} onSelect={() => setEditing(item)}>
                          {t("portfolio.editDetails")}
                        </MenuItem>
                        <MenuItem icon={<Star />} onSelect={() => toggleFeatured(item)}>
                          {item.isFeatured ? t("portfolio.unfeature") : t("portfolio.feature")}
                        </MenuItem>
                        {canEarlier && (
                          <MenuItem icon={<ArrowLeft />} onSelect={() => move(item, -1)}>
                            {t("portfolio.moveEarlier")}
                          </MenuItem>
                        )}
                        {canLater && (
                          <MenuItem icon={<ArrowRight />} onSelect={() => move(item, 1)}>
                            {t("portfolio.moveLater")}
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(item)}>
                          {t("portfolio.delete")}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                  <div className="mt-2 min-w-0 px-0.5">
                    <p className={cn("truncate text-[13px]", item.caption ? "text-ink" : "text-ink-3")}>{item.caption ?? t("portfolio.noCaption")}</p>
                    <p className="truncate text-[12px] text-ink-3">
                      {item.serviceName ? (item.serviceBookable ? t("portfolio.bookThis", { name: item.serviceName }) : t("portfolio.notBookable", { name: item.serviceName })) : t("portfolio.notLinked")}
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
        title={t("portfolio.deleteTitle")}
        description={t("portfolio.deleteBody")}
        confirmLabel={t("portfolio.delete")}
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}

function EditDialog({ item, services, team, onClose }: { item: WorkItem; services: Opt[]; team: Opt[]; onClose: () => void }) {
  const t = useT("proSetup");
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
      toast.success(t("portfolio.saved"));
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
      title={t("portfolio.editDetails")}
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("portfolio.cancel")}
          </Button>
          <Button type="submit" form="work-form" loading={saving}>
            {t("portfolio.save")}
          </Button>
        </>
      }
    >
      <form id="work-form" onSubmit={save} className="space-y-4">
        {item.media && item.kind !== "before_after" && <MediaImage media={item.media} alt="" sizes="480px" fit="contain" className="h-48 w-full rounded-md" />}
        <FormError message={error} />
        <Field label={t("portfolio.caption")} optional hint={t("portfolio.captionHint")}>
          {(p) => <Textarea {...p} rows={2} maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} />}
        </Field>
        <Field label={t("portfolio.service")} optional hint={t("portfolio.serviceHint")}>
          {(p) => (
            <Select {...p} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">{t("portfolio.none")}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {team.length > 1 && (
          <Field label={t("portfolio.doneBy")} optional>
            {(p) => (
              <Select {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">{t("portfolio.notSpecified")}</option>
                {team.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Switch checked={featured} onCheckedChange={setFeatured} label={t("portfolio.featureThis")} description={t("portfolio.featureThisHint")} />
      </form>
    </Dialog>
  );
}

function PickImage({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  const t = useT("proSetup");
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
        aria-label={file ? t("portfolio.pair.change", { label, file: file.name }) : t("portfolio.pair.choose", { label })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {file && url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" /> : <ImagePlus className="size-5 text-ink-3" />}
        {!file && <span>{t("portfolio.pair.choosePhoto")}</span>}
        <span className="absolute start-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{label}</span>
      </button>
    </div>
  );
}

function BeforeAfterDialog({ businessId, services, onClose }: { businessId: string; services: Opt[]; onClose: () => void }) {
  const t = useT("proSetup");
  const router = useRouter();
  const [before, setBefore] = useState<File | null>(null);
  const [after, setAfter] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!before || !after) {
      setError(t("portfolio.pair.errorBoth"));
      return;
    }
    setError(null);
    try {
      setProgress(t("portfolio.pair.uploadingBefore"));
      const b = await uploadMedia(before, { purpose: "portfolio", businessId, onProgress: (p) => setProgress(`${t("portfolio.pair.uploadingBefore")} ${p}%`) });
      setProgress(t("portfolio.pair.uploadingAfter"));
      const a = await uploadMedia(after, { purpose: "portfolio", businessId, onProgress: (p) => setProgress(`${t("portfolio.pair.uploadingAfter")} ${p}%`) });
      setProgress(t("portfolio.pair.saving"));
      await api("/api/pro/portfolio", { body: { mediaId: a.id, beforeMediaId: b.id, caption: caption.trim() || null, serviceId: serviceId || null } });
      toast.success(t("portfolio.pair.added"));
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
      title={t("portfolio.pair.title")}
      description={t("portfolio.pair.description")}
      locked={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("portfolio.cancel")}
          </Button>
          <Button onClick={save} loading={busy}>
            {t("portfolio.pair.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <PickImage label={t("portfolio.pair.before")} file={before} onPick={setBefore} />
          <PickImage label={t("portfolio.pair.after")} file={after} onPick={setAfter} />
        </div>
        <FormError message={error} />
        {progress && (
          <p className="text-[13px] text-ink-3" aria-live="polite">
            {progress}
          </p>
        )}
        <Field label={t("portfolio.caption")} optional>
          {(p) => <Textarea {...p} rows={2} maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} />}
        </Field>
        <Field label={t("portfolio.service")} optional hint={t("portfolio.pair.serviceHint")}>
          {(p) => (
            <Select {...p} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">{t("portfolio.none")}</option>
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
