"use client";

import { Camera, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { MonogramCover } from "@/components/business/monogram";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { MediaImage, type MediaLike } from "@/components/ui/media";
import { SocialIcon } from "@/components/profile/social-icons";
import { normalizeSocial, SOCIAL, SOCIAL_KEYS, socialHref, type SocialKey } from "@/domain/social";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";
import { SettingsCard } from "./settings-shell";

type Values = {
  name: string;
  tagline: string;
  about: string;
  primaryCategoryId: string | null;
  contactEmail: string;
  contactPhone: string;
  website: string;
  socialLinks: Record<string, string>;
  languages: string[];
  amenities: string[];
  yearsExperience: number | null;
  timezone: string;
  logoMediaId: string | null;
  coverMediaId: string | null;
};


const LANGUAGE_SUGGESTIONS = ["English", "Spanish", "French", "Portuguese", "Mandarin", "Cantonese", "Arabic", "Russian", "Haitian Creole", "Korean", "Vietnamese", "Hindi", "Italian", "German", "Polish", "Tagalog"];
const AMENITY_SUGGESTIONS = ["Wheelchair accessible", "Street parking", "Free parking", "Wi-Fi", "Card payments", "Walk-ins welcome", "Kid friendly", "Restroom", "Air conditioning", "Drinks offered", "Gender-neutral", "Pet friendly"];

/** Business profile editor: one save for the whole page, only changed fields are sent. */
export function ProfileSettings(props: {
  businessId: string;
  slug: string;
  live: boolean;
  kind: "individual" | "business";
  categories: { id: string; name: string; children: { id: string; name: string }[] }[];
  initial: Values;
  logo: MediaLike | null;
  cover: MediaLike | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(props.initial);
  const [v, setV] = useState(props.initial);
  const [logo, setLogo] = useState(props.logo);
  const [cover, setCover] = useState(props.cover);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  const changed = useMemo(() => {
    const out: Partial<Values> = {};
    for (const k of Object.keys(v) as (keyof Values)[]) if (JSON.stringify(v[k]) !== JSON.stringify(saved[k])) (out as Record<string, unknown>)[k] = v[k];
    return out;
  }, [v, saved]);
  const dirty = Object.keys(changed).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));

  async function upload(kind: "logo" | "cover", file?: File) {
    if (!file) return;
    setUploading(kind);
    try {
      const res = await uploadMedia(file, { purpose: kind, businessId: props.businessId, alt: kind === "logo" ? `${v.name} logo` : `${v.name}` });
      if (kind === "logo") {
        setLogo(res.media);
        set("logoMediaId", res.id);
      } else {
        setCover(res.media);
        set("coverMediaId", res.id);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const body: Record<string, unknown> = { ...changed };
      for (const k of ["tagline", "about", "contactEmail", "contactPhone", "website"] as const) if (k in body) body[k] = (body[k] as string).trim() || null;
      await api("/api/pro/business/profile", { method: "PUT", body });
      setSaved(v);
      toast.success("Profile updated", { description: props.live ? "Changes are live on your page." : undefined });
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      setErrors(e.fields ?? {});
      setFormError(e.fields ? "Check the highlighted fields." : e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-24">
      <FormError message={formError} />

      <SettingsCard id="photos-h" title="Photos" description="Your logo appears on cards and messages; the cover leads your page. Use your own work or space — not stock photos.">
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface-2">
          <div className="aspect-[3/1] w-full">{cover ? <MediaImage media={cover} sizes="640px" className="size-full" /> : <div className="flex size-full items-center justify-center text-[13px] text-ink-3">No cover photo</div>}</div>
          <div className="absolute bottom-3 right-3 flex gap-2">
            {cover && (
              <button
                type="button"
                onClick={() => {
                  setCover(null);
                  set("coverMediaId", null);
                }}
                className="inline-flex h-9 items-center rounded-md bg-surface/95 px-3 text-sm font-medium text-ink shadow-sm hover:bg-surface"
              >
                Remove
              </button>
            )}
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-surface/95 px-3 text-sm font-medium text-ink shadow-sm hover:bg-surface focus-within:ring-3 focus-within:ring-accent/20">
              <Camera className="size-4" /> {uploading === "cover" ? "Uploading…" : cover ? "Change cover" : "Add cover"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload("cover", e.target.files?.[0])} disabled={uploading != null} />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">{logo ? <MediaImage media={logo} sizes="80px" className="size-full" /> : <MonogramCover name={v.name || "?"} size="sm" className="size-full" />}</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2 focus-within:ring-3 focus-within:ring-accent/20">
              <Camera className="size-4" /> {uploading === "logo" ? "Uploading…" : logo ? "Change logo" : "Add logo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload("logo", e.target.files?.[0])} disabled={uploading != null} />
            </label>
            {logo && (
              <button
                type="button"
                className="h-10 px-2 text-sm text-ink-3 hover:text-danger"
                onClick={() => {
                  setLogo(null);
                  set("logoMediaId", null);
                }}
              >
                Remove
              </button>
            )}
            <p className="w-full text-[13px] text-ink-3">Square works best. Without one we show your initials.</p>
          </div>
        </div>
      </SettingsCard>

      <div className="mt-6" />
      <SettingsCard id="basics-h" title="Basics">
        <Field label={props.kind === "individual" ? "Your name or business name" : "Business name"} error={errors.name}>
          {(p) => <Input {...p} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />}
        </Field>
        <Field label="Tagline" optional error={errors.tagline} hint={`One line under your name. ${140 - v.tagline.length} characters left.`}>
          {(p) => <Input {...p} value={v.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={140} placeholder="e.g. Precision fades and beard work in Bed-Stuy" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Main category" hint="Where you show up when people browse.">
            {(p) => (
              <Select {...p} value={v.primaryCategoryId ?? ""} onChange={(e) => set("primaryCategoryId", e.target.value || null)}>
                <option value="">Choose…</option>
                {props.categories.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name}</option>
                    {c.children.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Years of experience" optional>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={v.yearsExperience ?? ""}
                onChange={(e) => {
                  const n = e.target.value.replace(/\D/g, "").slice(0, 2);
                  set("yearsExperience", n ? Number(n) : null);
                }}
                className="w-28"
              />
            )}
          </Field>
        </div>
      </SettingsCard>

      <div className="mt-6" />
      <SettingsCard id="about-h" title="About" description="What you do, how you work, what makes a visit with you different. Plain words beat buzzwords.">
        <Field label="About" error={errors.about} hint={`${v.about.length} / 4000`}>
          {(p) => <Textarea {...p} rows={7} value={v.about} onChange={(e) => set("about", e.target.value)} maxLength={4000} />}
        </Field>
        <TagField label="Languages spoken" values={v.languages} onChange={(x) => set("languages", x)} suggestions={LANGUAGE_SUGGESTIONS} max={10} />
        <TagField label="Amenities" values={v.amenities} onChange={(x) => set("amenities", x)} suggestions={AMENITY_SUGGESTIONS} max={20} />
      </SettingsCard>

      <div className="mt-6" />
      <SettingsCard id="contact-h" title="Contact & links" description="Shown on your page. Clients can always message you through Kept, so these are optional.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Public email" optional error={errors.contactEmail}>
            {(p) => <Input {...p} type="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} autoComplete="email" />}
          </Field>
          <Field label="Public phone" optional error={errors.contactPhone}>
            {(p) => <Input {...p} type="tel" value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} autoComplete="tel" />}
          </Field>
        </div>
        <Field label="Website" optional error={errors.website}>
          {(p) => <Input {...p} type="url" inputMode="url" value={v.website} onChange={(e) => set("website", e.target.value)} placeholder="yourdomain.com" />}
        </Field>
        <SocialInputs values={v.socialLinks} onChange={(x) => set("socialLinks", x)} serverErrors={errors} />
      </SettingsCard>

      <div className="mt-6" />
      <SettingsCard id="tz-h" title="Time zone" description="Your hours and every appointment time are in this zone. Change it only if you've actually moved — existing bookings keep their exact time.">
        <Field label="Time zone">
          {(p) => (
            <Select {...p} value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </SettingsCard>

      <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface lg:bottom-0 lg:left-[248px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <p className="min-w-0 truncate text-sm text-ink-3" aria-live="polite">
            {saving ? "Saving…" : dirty ? "Unsaved changes" : (
              <Link href={`/${props.slug}`} target="_blank" className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink">
                View your page <ExternalLink className="size-3.5" />
              </Link>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setV(saved);
                  setLogo(props.logo);
                  setCover(props.cover);
                }}
                disabled={saving}
              >
                Discard
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty || uploading != null}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TagField({ label, values, onChange, suggestions, max }: { label: string; values: string[]; onChange: (v: string[]) => void; suggestions: string[]; max: number }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!t || values.length >= max || values.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    onChange([...values, t]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
  };
  const open = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        <span>{label}</span>
        <span className="text-xs font-normal text-ink-3">Optional</span>
      </label>
      <div className="mt-1.5 flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        {values.map((t) => (
          <span key={t} className="inline-flex h-7 items-center gap-1 rounded-sm bg-surface-2 pl-2 pr-1 text-[13px] text-ink">
            {t}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== t))} className="flex size-5 items-center justify-center rounded-sm text-ink-3 hover:bg-line hover:text-ink" aria-label={`Remove ${t}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft && add(draft)} className="h-7 min-w-32 flex-1 bg-transparent px-1 text-[15px] text-ink outline-none" placeholder={values.length ? "" : "Type and press Enter"} />
      </div>
      {open.length > 0 && values.length < max && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="h-7 rounded-sm border border-dashed border-line-strong px-2 text-[13px] text-ink-2 hover:border-ink-3 hover:text-ink">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shows stored values the way people type them: Spotify artists as their link, the rest as handles. */
function displaySocial(key: SocialKey, value: string) {
  if (key === "spotify" && /^(artist|user)\//.test(value)) return socialHref(key, value) ?? value;
  if (key === "linkedin" && value.startsWith("in/")) return value.slice(3);
  return value;
}

function SocialInputs({ values, onChange, serverErrors }: { values: Record<string, string>; onChange: (v: Record<string, string>) => void; serverErrors: Record<string, string> }) {
  const [blurErrors, setBlurErrors] = useState<Partial<Record<SocialKey, string>>>({});
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">Social profiles</legend>
      <p className="mt-0.5 text-[13px] text-ink-3">
        Type your handle or paste your profile link. To feature specific videos, posts or tracks on your page, add them in{" "}
        <Link href="/pro/work#socials" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Portfolio
        </Link>
        .
      </p>
      <div className="mt-3 grid gap-x-3 gap-y-2.5 sm:grid-cols-2">
        {SOCIAL_KEYS.map((k) => {
          const spec = SOCIAL[k];
          const error = serverErrors[`socialLinks.${k}`] ?? blurErrors[k];
          const id = `social-${k}`;
          return (
            <div key={k} className="min-w-0">
              <div
                className={cn(
                  "flex h-11 items-center overflow-hidden rounded-md border bg-surface focus-within:ring-3 md:h-10",
                  error ? "border-danger focus-within:ring-danger/15" : "border-line-strong focus-within:border-accent focus-within:ring-accent/15",
                )}
              >
                <label htmlFor={id} className="flex h-full w-[118px] shrink-0 items-center gap-2 border-r border-line bg-surface-2 px-3 text-[13px] text-ink-2">
                  <SocialIcon name={k} className="size-3.5 shrink-0 text-ink-3" />
                  {spec.label}
                </label>
                <input
                  id={id}
                  value={displaySocial(k, values[k] ?? "")}
                  onChange={(e) => {
                    onChange({ ...values, [k]: e.target.value });
                    if (blurErrors[k]) setBlurErrors((s) => ({ ...s, [k]: undefined }));
                  }}
                  onBlur={(e) => {
                    const r = normalizeSocial(k, e.target.value);
                    setBlurErrors((s) => ({ ...s, [k]: r.ok ? undefined : r.error }));
                  }}
                  maxLength={200}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-ink-3"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-err` : undefined}
                  placeholder={spec.placeholder}
                />
              </div>
              {error && (
                <p id={`${id}-err`} className="mt-1 text-[13px] text-danger">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
