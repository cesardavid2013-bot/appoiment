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
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import type { TFunction } from "@/i18n/translate";
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


// Suggestions are offered in the pro's language; what they pick is saved as plain text.
// The English wording is kept so a tag saved in English isn't suggested again in another language.
const LANGUAGE_SUGGESTIONS: [string, string][] = [
  ["english", "English"],
  ["spanish", "Spanish"],
  ["french", "French"],
  ["portuguese", "Portuguese"],
  ["mandarin", "Mandarin"],
  ["cantonese", "Cantonese"],
  ["arabic", "Arabic"],
  ["russian", "Russian"],
  ["haitianCreole", "Haitian Creole"],
  ["korean", "Korean"],
  ["vietnamese", "Vietnamese"],
  ["hindi", "Hindi"],
  ["italian", "Italian"],
  ["german", "German"],
  ["polish", "Polish"],
  ["tagalog", "Tagalog"],
];
const AMENITY_SUGGESTIONS: [string, string][] = [
  ["wheelchair", "Wheelchair accessible"],
  ["streetParking", "Street parking"],
  ["freeParking", "Free parking"],
  ["wifi", "Wi-Fi"],
  ["cardPayments", "Card payments"],
  ["walkIns", "Walk-ins welcome"],
  ["kidFriendly", "Kid friendly"],
  ["restroom", "Restroom"],
  ["airConditioning", "Air conditioning"],
  ["drinks", "Drinks offered"],
  ["genderNeutral", "Gender-neutral"],
  ["petFriendly", "Pet friendly"],
];
type Suggestion = { label: string; en: string };

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
  const t = useT("proSettings");
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
      const res = await uploadMedia(file, { purpose: kind, businessId: props.businessId, alt: kind === "logo" ? t("profile.logoAlt", { name: v.name }) : v.name });
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
      toast.success(t("profile.toastUpdated"), { description: props.live ? t("profile.toastLive") : undefined });
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      setErrors(e.fields ?? {});
      setFormError(e.fields ? t("saveBar.checkFields") : e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-24">
      <FormError message={formError} />

      <SettingsCard id="photos-h" title={t("profile.photos.title")} description={t("profile.photos.description")}>
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface-2">
          <div className="aspect-[3/1] w-full">{cover ? <MediaImage media={cover} sizes="640px" className="size-full" /> : <div className="flex size-full items-center justify-center text-[13px] text-ink-3">{t("profile.photos.noCover")}</div>}</div>
          <div className="absolute bottom-3 end-3 flex gap-2">
            {cover && (
              <button
                type="button"
                onClick={() => {
                  setCover(null);
                  set("coverMediaId", null);
                }}
                className="inline-flex h-9 items-center rounded-md bg-surface/95 px-3 text-sm font-medium text-ink shadow-sm hover:bg-surface"
              >
                {t("profile.photos.remove")}
              </button>
            )}
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-surface/95 px-3 text-sm font-medium text-ink shadow-sm hover:bg-surface focus-within:ring-3 focus-within:ring-accent/20">
              <Camera className="size-4" /> {uploading === "cover" ? t("profile.photos.uploading") : cover ? t("profile.photos.changeCover") : t("profile.photos.addCover")}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload("cover", e.target.files?.[0])} disabled={uploading != null} />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">{logo ? <MediaImage media={logo} sizes="80px" className="size-full" /> : <MonogramCover name={v.name || "?"} size="sm" className="size-full" />}</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2 focus-within:ring-3 focus-within:ring-accent/20">
              <Camera className="size-4" /> {uploading === "logo" ? t("profile.photos.uploading") : logo ? t("profile.photos.changeLogo") : t("profile.photos.addLogo")}
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
                {t("profile.photos.remove")}
              </button>
            )}
            <p className="w-full text-[13px] text-ink-3">{t("profile.photos.logoHint")}</p>
          </div>
        </div>
      </SettingsCard>

      <div className="mt-6" />
      <SettingsCard id="basics-h" title={t("profile.basics.title")}>
        <Field label={props.kind === "individual" ? t("profile.basics.nameIndividual") : t("profile.basics.nameBusiness")} error={errors.name}>
          {(p) => <Input {...p} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />}
        </Field>
        <Field label={t("profile.basics.tagline")} optional error={errors.tagline} hint={t("profile.basics.taglineHint", { count: 140 - v.tagline.length })}>
          {(p) => <Input {...p} value={v.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={140} placeholder={t("profile.basics.taglinePlaceholder")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.basics.category")} hint={t("profile.basics.categoryHint")}>
            {(p) => (
              <Select {...p} value={v.primaryCategoryId ?? ""} onChange={(e) => set("primaryCategoryId", e.target.value || null)}>
                <option value="">{t("profile.basics.choose")}</option>
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
          <Field label={t("profile.basics.years")} optional>
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
      <SettingsCard id="about-h" title={t("profile.about.title")} description={t("profile.about.description")}>
        <Field label={t("profile.about.label")} error={errors.about} hint={`${v.about.length} / 4000`}>
          {(p) => <Textarea {...p} rows={7} value={v.about} onChange={(e) => set("about", e.target.value)} maxLength={4000} />}
        </Field>
        <TagField id="languages" label={t("profile.about.languages")} values={v.languages} onChange={(x) => set("languages", x)} suggestions={LANGUAGE_SUGGESTIONS.map(([k, en]) => ({ label: t(`profile.suggestions.languages.${k}`), en }))} max={10} />
        <TagField id="amenities" label={t("profile.about.amenities")} values={v.amenities} onChange={(x) => set("amenities", x)} suggestions={AMENITY_SUGGESTIONS.map(([k, en]) => ({ label: t(`profile.suggestions.amenities.${k}`), en }))} max={20} />
      </SettingsCard>

      <div className="mt-6" />
      <SettingsCard id="contact-h" title={t("profile.contact.title")} description={t("profile.contact.description")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.contact.email")} optional error={errors.contactEmail}>
            {(p) => <Input {...p} type="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} autoComplete="email" />}
          </Field>
          <Field label={t("profile.contact.phone")} optional error={errors.contactPhone}>
            {(p) => <Input {...p} type="tel" value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} autoComplete="tel" />}
          </Field>
        </div>
        <Field label={t("profile.contact.website")} optional error={errors.website}>
          {(p) => <Input {...p} type="url" inputMode="url" value={v.website} onChange={(e) => set("website", e.target.value)} placeholder={t("profile.contact.websitePlaceholder")} />}
        </Field>
        <SocialInputs values={v.socialLinks} onChange={(x) => set("socialLinks", x)} serverErrors={errors} />
      </SettingsCard>

      <div className="mt-6" />
      <SettingsCard id="tz-h" title={t("profile.timezone.title")} description={t("profile.timezone.description")}>
        <Field label={t("profile.timezone.label")}>
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

      <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface lg:bottom-0 lg:start-[248px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <p className="min-w-0 truncate text-sm text-ink-3" aria-live="polite">
            {saving ? t("saveBar.saving") : dirty ? t("saveBar.unsaved") : (
              <Link href={`/${props.slug}`} target="_blank" className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink">
                {t("profile.viewPage")} <ExternalLink className="size-3.5" />
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
                {t("saveBar.discard")}
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty || uploading != null}>
              {t("saveBar.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TagField({ id, label, values, onChange, suggestions, max }: { id: string; label: string; values: string[]; onChange: (v: string[]) => void; suggestions: Suggestion[]; max: number }) {
  const t = useT("proSettings");
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag || values.length >= max || values.some((x) => x.toLowerCase() === tag.toLowerCase())) return;
    onChange([...values, tag]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
  };
  const taken = new Set(values.map((v) => v.toLowerCase()));
  const open = suggestions
    .filter((s) => !taken.has(s.label.toLowerCase()) && !taken.has(s.en.toLowerCase()))
    .map((s) => s.label)
    .slice(0, 8);
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        <span>{label}</span>
        <span className="text-xs font-normal text-ink-3">{t("profile.tags.optional")}</span>
      </label>
      <div className="mt-1.5 flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        {values.map((tag) => (
          <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-sm bg-surface-2 ps-2 pe-1 text-[13px] text-ink">
            {tag}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== tag))} className="flex size-5 items-center justify-center rounded-sm text-ink-3 hover:bg-line hover:text-ink" aria-label={t("profile.tags.remove", { tag })}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft && add(draft)} className="h-7 min-w-32 flex-1 bg-transparent px-1 text-[15px] text-ink outline-none" placeholder={values.length ? "" : t("profile.tags.placeholder")} />
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

/** The domain check's English message, in the viewer's language. */
function socialError(t: TFunction, key: SocialKey, english: string) {
  const network = SOCIAL[key].label;
  if (english.startsWith("That isn't")) return t("profile.social.errors.wrongNetwork", { network });
  if (english.startsWith("Use the link")) return t("profile.social.errors.useProfile", { network });
  if (english.startsWith("That doesn't look like")) return t(key === "spotify" ? "profile.social.errors.badArtist" : "profile.social.errors.badHandle", { network });
  return english;
}

function SocialInputs({ values, onChange, serverErrors }: { values: Record<string, string>; onChange: (v: Record<string, string>) => void; serverErrors: Record<string, string> }) {
  const t = useT("proSettings");
  const [blurErrors, setBlurErrors] = useState<Partial<Record<SocialKey, string>>>({});
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{t("profile.social.legend")}</legend>
      <p className="mt-0.5 text-[13px] text-ink-3">
        {rich(t("profile.social.hint"), {
          link: (c) => (
            <Link href="/pro/work#socials" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
              {c}
            </Link>
          ),
        })}
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
                <label htmlFor={id} className="flex h-full w-[118px] shrink-0 items-center gap-2 border-e border-line bg-surface-2 px-3 text-[13px] text-ink-2">
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
                    setBlurErrors((s) => ({ ...s, [k]: r.ok ? undefined : socialError(t, k, r.error) }));
                  }}
                  maxLength={200}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-ink-3"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-err` : undefined}
                  placeholder={t(`profile.social.placeholders.${k}`)}
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
