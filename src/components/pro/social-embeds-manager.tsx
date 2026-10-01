"use client";

import { ArrowDown, ArrowUp, ExternalLink, Link2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { EmbedPlayer } from "@/components/profile/social-embed";
import { SocialIcon } from "@/components/profile/social-icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { embedShape, embedThumbnail, KIND_LABEL, MAX_EMBEDS, parseEmbedUrl, PROVIDER_LABEL, safeEmbedLink, type EmbedKind, type EmbedProvider, type EmbedShape } from "@/domain/social";
import { api, type ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

export type SocialEmbedRow = {
  id: string;
  provider: EmbedProvider;
  kind: EmbedKind;
  providerId: string;
  url: string;
  caption: string | null;
  serviceId: string | null;
  serviceName: string | null;
  serviceBookable: boolean;
  shape: EmbedShape;
};

type Opt = { id: string; name: string };

const PREVIEW_WIDTH: Record<EmbedShape, string> = { portrait: "w-40 sm:w-44", landscape: "w-full sm:w-72", audio: "w-full sm:w-80" };

/** "From your socials": paste a link, preview it, feature it on the profile. */
export function SocialEmbedsManager({ items, services }: { items: SocialEmbedRow[]; services: Opt[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [synced, setSynced] = useState(items);
  const [editing, setEditing] = useState<SocialEmbedRow | null>(null);
  const [deleting, setDeleting] = useState<SocialEmbedRow | null>(null);
  const [busy, setBusy] = useState(false);

  if (synced !== items) {
    setSynced(items);
    setOrder(items.map((i) => i.id));
  }
  const list = order.map((id) => items.find((i) => i.id === id)).filter((x): x is SocialEmbedRow => Boolean(x));
  const full = list.length >= MAX_EMBEDS;

  async function move(item: SocialEmbedRow, dir: -1 | 1) {
    const i = order.indexOf(item.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    const prev = order;
    setOrder(next);
    try {
      await api("/api/pro/social-embeds/reorder", { body: { ids: next } });
      router.refresh();
    } catch (err) {
      setOrder(prev);
      toast.error((err as ApiError).message);
      router.refresh();
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/pro/social-embeds/${deleting.id}`, { method: "DELETE" });
      toast.success("Removed from your profile");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="socials" aria-labelledby="socials-h" className="scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="socials-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
          From your socials
        </h2>
        <p className="text-[13px] text-ink-3 tabular">
          {list.length} of {MAX_EMBEDS}
        </p>
      </div>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-3">
        Feature YouTube videos and Shorts, TikToks, Instagram posts and reels, Vimeo videos, SoundCloud tracks and Spotify releases in the Featured section of your profile. Players only load when a visitor presses play.
      </p>

      {full ? (
        <p className="mt-5 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">You&apos;re featuring {MAX_EMBEDS} posts, the most a profile can show. Remove one to add another.</p>
      ) : (
        <AddEmbed services={services} />
      )}

      {list.length > 0 && (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {list.map((item, idx) => {
            const thumb = embedThumbnail(item.provider, item.kind, item.providerId);
            const link = safeEmbedLink(item.provider, item.url);
            const label = item.caption ?? `${PROVIDER_LABEL[item.provider]} ${KIND_LABEL[item.kind].toLowerCase()}`;
            return (
              <li key={item.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                <span className="w-6 shrink-0 text-right text-[13px] text-ink-3 tabular" aria-hidden>
                  {idx + 1}
                </span>
                <button type="button" onClick={() => setEditing(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Edit ${label}`}>
                  <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-ink-2">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
                    ) : (
                      <SocialIcon name={item.provider} className="size-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                      <SocialIcon name={item.provider} className="size-3" />
                      {PROVIDER_LABEL[item.provider]} · {KIND_LABEL[item.kind]}
                    </span>
                    <span className={cn("mt-0.5 block truncate text-[15px]", item.caption ? "text-ink" : "text-ink-3")}>{item.caption ?? "No caption"}</span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {item.serviceName ? (item.serviceBookable ? `Book this: ${item.serviceName}` : `${item.serviceName} (not bookable)`) : "Not linked to a service"}
                    </span>
                  </span>
                </button>
                <div className="hidden shrink-0 items-center gap-1 sm:flex">
                  <button
                    type="button"
                    onClick={() => move(item, -1)}
                    disabled={idx === 0}
                    className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35"
                    aria-label={`Move ${label} up`}
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(item, 1)}
                    disabled={idx === list.length - 1}
                    className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35"
                    aria-label={`Move ${label} down`}
                  >
                    <ArrowDown className="size-4" />
                  </button>
                </div>
                <Menu>
                  <MenuTrigger className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink sm:size-9" aria-label={`Actions for ${label}`}>
                    <MoreHorizontal className="size-4" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem icon={<Pencil />} onSelect={() => setEditing(item)}>
                      Edit caption &amp; service
                    </MenuItem>
                    {idx > 0 && (
                      <MenuItem icon={<ArrowUp />} onSelect={() => move(item, -1)}>
                        Move up
                      </MenuItem>
                    )}
                    {idx < list.length - 1 && (
                      <MenuItem icon={<ArrowDown />} onSelect={() => move(item, 1)}>
                        Move down
                      </MenuItem>
                    )}
                    {link && (
                      <MenuItem icon={<ExternalLink />} onSelect={() => window.open(link, "_blank", "noopener,noreferrer")}>
                        Open on {PROVIDER_LABEL[item.provider]}
                      </MenuItem>
                    )}
                    <MenuSeparator />
                    <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(item)}>
                      Remove
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <EditEmbed key={editing.id} item={editing} services={services} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this from your profile?"
        description="It disappears from the Featured section right away. The post itself stays on your social account."
        confirmLabel="Remove"
        loading={busy}
        onConfirm={remove}
      />
    </section>
  );
}

function ServiceSelect({ value, onChange, services, id, ...aria }: { value: string; onChange: (v: string) => void; services: Opt[]; id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) {
  return (
    <Select id={id} {...aria} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>
      {services.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

function AddEmbed({ services }: { services: Opt[] }) {
  const router = useRouter();
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [caption, setCaption] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const parsed = url.trim() ? parseEmbedUrl(url) : null;
  const preview = parsed?.ok ? parsed.embed : null;
  // Don't nag while someone is still typing a link by hand; pasted links validate at once.
  const error = serverError ?? (parsed && !parsed.ok && (touched || /^https?:\/\//i.test(url.trim())) ? parsed.error : null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!preview) return;
    setSaving(true);
    setServerError(null);
    try {
      await api("/api/pro/social-embeds", { body: { url: preview.url, caption: caption.trim() || null, serviceId: serviceId || null } });
      toast.success(`${PROVIDER_LABEL[preview.provider]} ${KIND_LABEL[preview.kind].toLowerCase()} added to your profile`);
      setUrl("");
      setCaption("");
      setServiceId("");
      setTouched(false);
      router.refresh();
    } catch (err) {
      const e2 = err as ApiError;
      setServerError(e2.fields?.url ?? e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={add} className="mt-5 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        Link to a video, post or track
      </label>
      <div className="relative mt-1.5">
        <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setServerError(null);
          }}
          onBlur={() => url.trim() && setTouched(true)}
          placeholder="https://www.youtube.com/watch?v=…"
          className="pl-9"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${inputId}-status`}
        />
      </div>
      <p id={`${inputId}-status`} aria-live="polite" className={cn("mt-1.5 text-[13px] leading-snug", error ? "text-danger" : "text-ink-3")}>
        {error ?? (preview ? `${PROVIDER_LABEL[preview.provider]} ${KIND_LABEL[preview.kind].toLowerCase()} found. Check the preview, then add it.` : "Copy the link from the Share button on YouTube, TikTok, Instagram, Vimeo, SoundCloud or Spotify.")}
      </p>

      {preview && (
        <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-start">
          <div className={cn("shrink-0", PREVIEW_WIDTH[embedShape(preview.provider, preview.kind)])}>
            <EmbedPlayer key={`${preview.provider}:${preview.providerId}`} item={{ ...preview, caption: caption.trim() || null }} />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <Field label="Caption" optional hint="A line about it — e.g. “Mixed and mastered for Lina Vega”.">
              {(p) => <Textarea {...p} rows={2} maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} />}
            </Field>
            <Field label="Service" optional hint="Adds a “Book this” link under the post.">
              {(p) => <ServiceSelect {...p} value={serviceId} onChange={setServiceId} services={services} />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={saving}>
                Add to profile
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setUrl("");
                  setCaption("");
                  setServiceId("");
                  setTouched(false);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function EditEmbed({ item, services, onClose }: { item: SocialEmbedRow; services: Opt[]; onClose: () => void }) {
  const router = useRouter();
  const [caption, setCaption] = useState(item.caption ?? "");
  const [serviceId, setServiceId] = useState(item.serviceId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/pro/social-embeds/${item.id}`, { method: "PUT", body: { caption: caption.trim() || null, serviceId: serviceId || null } });
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
      title={`${PROVIDER_LABEL[item.provider]} ${KIND_LABEL[item.kind].toLowerCase()}`}
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="embed-form" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="embed-form" onSubmit={save} className="space-y-4">
        <div className={cn("mx-auto", item.shape === "portrait" ? "w-44" : "w-full")}>
          <EmbedPlayer item={{ ...item, caption: caption.trim() || null }} />
        </div>
        <FormError message={error} />
        <Field label="Caption" optional>
          {(p) => <Textarea {...p} rows={2} maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} />}
        </Field>
        <Field label="Service" optional hint="Customers see a “Book this” link under the post.">
          {(p) => <ServiceSelect {...p} value={serviceId} onChange={setServiceId} services={services} />}
        </Field>
      </form>
    </Dialog>
  );
}
