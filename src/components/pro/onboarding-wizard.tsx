"use client";

import { ArrowLeft, Camera, Check, ExternalLink, LocateFixed, MapPin, Monitor, Plus, Store, Trash2, User, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/controls";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar, type MediaLike } from "@/components/ui/media";
import { formatDuration, formatMoney, parseMoneyInput } from "@/domain/money";
import { DURATION_CHOICES, templatesFor } from "@/domain/service-templates";
import { slugify } from "@/domain/slugs";
import { useLocale, useT } from "@/i18n/client";
import { categoryName } from "@/i18n/helpers";
import type { TFunction } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { uploadMedia } from "@/lib/upload";
import { hoursAreValid, WeeklyHoursEditor, type DayHours } from "./weekly-hours-editor";

type Category = { id: string; slug: string; name: string; children: { id: string; slug: string; name: string }[] };

type WizardBusiness = {
  id: string;
  slug: string;
  name: string;
  kind: "individual" | "business";
  status: string;
  memberId: string;
  categorySlug: string | null;
  parentCategorySlug: string | null;
  tagline: string | null;
  about: string | null;
  logo: MediaLike | null;
  logoMediaId: string | null;
  timezone: string;
  currency: string;
  bookingMode: "instant" | "request";
  cancellationWindowHours: number;
  lateCancelFeePercent: number;
  minNoticeMinutes: number;
  paymentsEnabled: boolean;
  onboarding: { completed?: string[]; skipped?: string[] };
  locations: { id: string; kind: string; name: string; line1: string | null; city: string | null; region: string | null; postalCode: string | null }[];
  services: { id: string; name: string; durationMinutes: number; priceCents: number; priceType: string }[];
  hours: DayHours[];
  checklist: { key: string; done: boolean; label: string }[];
};

const STEPS = [
  { key: "category" },
  { key: "kind" },
  { key: "name" },
  { key: "branding", optional: true },
  { key: "location" },
  { key: "services" },
  { key: "availability" },
  { key: "policies", optional: true },
  { key: "payments", optional: true },
  { key: "preview" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "MXN", "BRL", "COP", "CLP", "ARS", "PEN"];

/** Translation with a fallback for labels that arrive from the server in English. */
function tOr(t: TFunction, key: string, fallback: string) {
  const v = t(key);
  return v === `proSetup.${key}` ? fallback : v;
}

export function OnboardingWizard({ categories, user, business: b, stripe, initialStep }: { categories: Category[]; user: { name: string }; business: WizardBusiness | null; stripe: boolean; initialStep?: string }) {
  const t = useT("proSetup");
  const tr = useT();
  const router = useRouter();
  const done = new Set(b?.onboarding.completed ?? []);
  const skipped = new Set(b?.onboarding.skipped ?? []);
  const firstOpen = (): StepKey => {
    if (!b) return "category";
    const order: StepKey[] = ["branding", "location", "services", "availability", "policies", "payments", "preview"];
    return order.find((s) => !done.has(s) && !skipped.has(s)) ?? "preview";
  };
  const [step, setStep] = useState<StepKey>(() => (STEPS.some((s) => s.key === initialStep) && (b || ["category", "kind", "name"].includes(initialStep!)) ? (initialStep as StepKey) : firstOpen()));

  // Pre-creation answers live here until the business exists.
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [kind, setKind] = useState<"individual" | "business" | null>(null);

  const allCats = useMemo(() => categories.flatMap((c) => [c, ...c.children.map((ch) => ({ ...ch, parent: c }))]), [categories]);
  const chosenCat = allCats.find((c) => c.id === categoryId) as (Category & { parent?: Category }) | undefined;
  const idx = STEPS.findIndex((s) => s.key === step);

  function go(next: StepKey) {
    setStep(next);
    window.scrollTo({ top: 0 });
    const url = new URL(window.location.href);
    url.searchParams.set("step", next);
    url.searchParams.delete("new");
    window.history.replaceState(null, "", url);
  }
  async function complete(key: StepKey, kindOf: "completed" | "skipped" = "completed") {
    if (b) await api("/api/pro/business/onboarding", { body: { step: key, kind: kindOf } }).catch(() => undefined);
    const i = STEPS.findIndex((s) => s.key === key);
    router.refresh();
    go(STEPS[Math.min(i + 1, STEPS.length - 1)].key);
  }

  const stepState = (key: StepKey) => (done.has(key) || (!b ? false : ["category", "kind", "name"].includes(key)) ? "done" : skipped.has(key) ? "skipped" : "todo");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo href={b ? "/pro/today" : "/"} suffix={t("onboarding.logoSuffix")} />
          <span className="ms-auto text-[13px] text-ink-3 tabular lg:hidden">
            {t("onboarding.progress", { step: idx + 1, total: STEPS.length })}
          </span>
          {b ? (
            <Link href="/pro/today" className="text-sm font-medium text-ink-2 hover:text-ink">
              {t("onboarding.saveExit")}
            </Link>
          ) : (
            <Link href="/" className="text-sm font-medium text-ink-2 hover:text-ink">
              {t("onboarding.exit")}
            </Link>
          )}
        </div>
        <div className="h-0.5 bg-line lg:hidden" aria-hidden>
          <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={t("onboarding.stepsNav")} className="hidden lg:block">
          <ol className="sticky top-28 space-y-1">
            {STEPS.map((s, i) => {
              const st = stepState(s.key);
              const reachable = b ? i >= 3 : i <= idx;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => go(s.key)}
                    aria-current={step === s.key ? "step" : undefined}
                    className={cn("flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start text-sm transition-colors", step === s.key ? "bg-surface-2 font-semibold text-ink" : reachable ? "text-ink-2 hover:text-ink" : "text-ink-3/60")}
                  >
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] tabular", st === "done" ? "border-accent bg-accent text-accent-ink" : step === s.key ? "border-ink text-ink" : "border-line-strong text-ink-3")}>
                      {st === "done" ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                    </span>
                    {t(`onboarding.steps.${s.key}`)}
                    {st === "skipped" && <span className="ms-auto text-[11px] text-ink-3">{t("onboarding.skipped")}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mx-auto w-full max-w-xl animate-rise lg:mx-0" key={step}>
          {step === "category" && (
            <StepFrame title={t("onboarding.category.title", { name: user.name.split(" ")[0] })} lead={t("onboarding.category.lead")}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categories.map((c) => {
                  const on = categoryId === c.id || c.children.some((ch) => ch.id === categoryId);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      aria-pressed={on}
                      className={cn("min-h-16 rounded-lg border px-3.5 py-3 text-start text-[15px] font-medium transition-[border-color,box-shadow]", on ? "border-ink shadow-[0_0_0_1px_var(--ink)]" : "border-line bg-surface hover:border-line-strong")}
                    >
                      {categoryName(tr, c.slug, c.name)}
                    </button>
                  );
                })}
              </div>
              {(() => {
                const parent = categories.find((c) => c.id === categoryId || c.children.some((ch) => ch.id === categoryId));
                if (!parent?.children.length) return null;
                return (
                  <div className="mt-6">
                    <p className="mb-2 text-sm font-medium text-ink">{t("onboarding.category.moreSpecific")}</p>
                    <div className="flex flex-wrap gap-2">
                      {parent.children.map((ch) => (
                        <button key={ch.id} type="button" onClick={() => setCategoryId(ch.id)} aria-pressed={categoryId === ch.id} className={cn("h-9 rounded-md border px-3 text-sm", categoryId === ch.id ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2 hover:text-ink")}>
                          {categoryName(tr, ch.slug, ch.name)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <Actions>
                <Button size="lg" disabled={!categoryId} onClick={() => go("kind")}>
                  {t("onboarding.continue")}
                </Button>
              </Actions>
            </StepFrame>
          )}

          {step === "kind" && (
            <StepFrame title={t("onboarding.kind.title")} lead={t("onboarding.kind.lead")}>
              <div className="grid gap-2">
                <ChoiceCard selected={kind === "individual"} onClick={() => setKind("individual")} title={<span className="flex items-center gap-2"><User className="size-4" /> {t("onboarding.kind.individual")}</span>} description={t("onboarding.kind.individualHint")} />
                <ChoiceCard selected={kind === "business"} onClick={() => setKind("business")} title={<span className="flex items-center gap-2"><Users className="size-4" /> {t("onboarding.kind.business")}</span>} description={t("onboarding.kind.businessHint")} />
              </div>
              <Actions back={() => go("category")}>
                <Button size="lg" disabled={!kind} onClick={() => go("name")}>
                  {t("onboarding.continue")}
                </Button>
              </Actions>
            </StepFrame>
          )}

          {step === "name" && <NameStep kind={kind ?? "individual"} userName={user.name} categoryId={categoryId} onBack={() => go("kind")} onCreated={() => { router.refresh(); go("branding"); }} />}

          {b && step === "branding" && <BrandingStep b={b} onDone={() => complete("branding")} onSkip={() => complete("branding", "skipped")} />}
          {b && step === "location" && <LocationStep b={b} onDone={() => complete("location")} />}
          {b && step === "services" && <ServicesStep b={b} categorySlug={chosenCat?.slug ?? b.categorySlug} parentSlug={chosenCat?.parent?.slug ?? b.parentCategorySlug} onDone={() => complete("services")} />}
          {b && step === "availability" && <HoursStep b={b} onDone={() => complete("availability")} />}
          {b && step === "policies" && <PoliciesStep b={b} onDone={() => complete("policies")} onSkip={() => complete("policies", "skipped")} />}
          {b && step === "payments" && <PaymentsStep b={b} stripe={stripe} onDone={() => complete("payments")} onSkip={() => complete("payments", "skipped")} />}
          {b && step === "preview" && <PreviewStep b={b} goTo={go} />}
        </div>
      </div>
    </div>
  );
}

function StepFrame({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h1 className="font-display text-[34px] leading-[1.08] tracking-[-0.01em] text-ink text-balance sm:text-[40px]">{title}</h1>
      {lead && <p className="mt-3 text-[15px] leading-relaxed text-ink-3 text-pretty">{lead}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Actions({ children, back, skip }: { children: ReactNode; back?: () => void; skip?: () => void }) {
  const t = useT("proSetup");
  return (
    <div className="mt-10 flex items-center gap-3 border-t border-line pt-6">
      {back && (
        <Button variant="ghost" onClick={back} icon={<ArrowLeft className="size-4" />}>
          {t("onboarding.back")}
        </Button>
      )}
      <div className="ms-auto flex items-center gap-2">
        {skip && (
          <Button variant="ghost" onClick={skip}>
            {t("onboarding.skip")}
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

function NameStep({ kind, userName, categoryId, onBack, onCreated }: { kind: "individual" | "business"; userName: string; categoryId: string | null; onBack: () => void; onCreated: () => void }) {
  const t = useT("proSetup");
  const [name, setName] = useState(kind === "individual" ? userName : "");
  const detected = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const [timezone, setTimezone] = useState(detected);
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return [detected];
    }
  }, [detected]);
  async function create() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/pro/business", { body: { name, kind, categoryId, timezone, currency } });
      onCreated();
    } catch (err) {
      setError((err as ApiError).message);
      setSaving(false);
    }
  }
  return (
    <StepFrame title={kind === "individual" ? t("onboarding.name.titleIndividual") : t("onboarding.name.titleBusiness")} lead={t("onboarding.name.lead")}>
      <div className="space-y-5">
        <FormError message={error} />
        <Field label={kind === "individual" ? t("onboarding.name.labelIndividual") : t("onboarding.name.labelBusiness")} hint={name.trim().length >= 2 ? t("onboarding.name.pageHint", { url: `kept.app/${slugify(name) || "…"}` }) : undefined}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder={kind === "individual" ? t("onboarding.name.placeholderIndividual") : t("onboarding.name.placeholderBusiness")} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("onboarding.name.timezone")} hint={t("onboarding.name.timezoneHint")}>
            {(p) => (
              <Select {...p} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("onboarding.name.currency")}>
            {(p) => (
              <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
      <Actions back={onBack}>
        <Button size="lg" disabled={name.trim().length < 2} loading={saving} onClick={create}>
          {t("onboarding.name.create")}
        </Button>
      </Actions>
    </StepFrame>
  );
}

function BrandingStep({ b, onDone, onSkip }: { b: WizardBusiness; onDone: () => void; onSkip: () => void }) {
  const t = useT("proSetup");
  const [tagline, setTagline] = useState(b.tagline ?? "");
  const [about, setAbout] = useState(b.about ?? "");
  const [logo, setLogo] = useState<{ id: string; media: MediaLike | null } | null>(b.logoMediaId ? { id: b.logoMediaId, media: b.logo } : null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const res = await uploadMedia(file, { purpose: "logo", businessId: b.id, onProgress: setProgress });
      setLogo({ id: res.id, media: res.media });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  }
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/pro/business/profile", { method: "PUT", body: { tagline: tagline.trim() || null, about: about.trim() || null, logoMediaId: logo?.id ?? null } });
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
      setSaving(false);
    }
  }
  return (
    <StepFrame title={t("onboarding.branding.title")} lead={t("onboarding.branding.lead")}>
      <div className="space-y-6">
        <FormError message={error} />
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar name={b.name} media={logo?.media ?? null} size={88} />
            {progress != null && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/60 text-sm font-semibold text-white tabular" aria-live="polite">
                {progress}%
              </span>
            )}
          </div>
          <div>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2">
              <Camera className="size-4" />
              {logo ? t("onboarding.branding.changePhoto") : t("onboarding.branding.addPhoto")}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <p className="mt-1.5 text-[13px] text-ink-3">{t("onboarding.branding.square")}</p>
          </div>
        </div>
        <Field label={t("onboarding.branding.tagline")} optional hint={`${tagline.length}/140`}>
          {(p) => <Input {...p} value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} placeholder={t("onboarding.branding.taglinePlaceholder")} />}
        </Field>
        <Field label={t("onboarding.branding.about")} optional>
          {(p) => <Textarea {...p} rows={5} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={4000} placeholder={t("onboarding.branding.aboutPlaceholder")} />}
        </Field>
      </div>
      <Actions skip={onSkip}>
        <Button size="lg" onClick={save} loading={saving} disabled={progress != null}>
          {t("onboarding.saveContinue")}
        </Button>
      </Actions>
    </StepFrame>
  );
}

function LocationStep({ b, onDone }: { b: WizardBusiness; onDone: () => void }) {
  const t = useT("proSetup");
  const [adding, setAdding] = useState(b.locations.length === 0);
  const [kind, setKind] = useState<"physical" | "mobile" | "virtual">("physical");
  const [form, setForm] = useState({ name: b.name, line1: "", line2: "", city: "", region: "", postalCode: "", country: "US", radius: "15" });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pin() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error(t("onboarding.location.locateError"));
      },
      { timeout: 8000 },
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await api("/api/pro/locations", {
        body: {
          name: kind === "physical" ? form.name : kind === "mobile" ? t("onboarding.location.mobileName") : t("onboarding.location.onlineName"),
          kind,
          line1: kind === "physical" ? form.line1 : null,
          line2: kind === "physical" ? form.line2 : null,
          city: kind === "virtual" ? null : form.city,
          region: kind === "virtual" ? null : form.region,
          postalCode: kind === "physical" ? form.postalCode : null,
          country: kind === "virtual" ? null : form.country,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          serviceRadiusKm: kind === "mobile" ? Number(form.radius) : null,
          timezone: b.timezone,
          isPrimary: b.locations.length === 0,
        },
      });
      onDone();
    } catch (err) {
      const e = err as ApiError;
      setFields(e.fields ?? {});
      setError(e.fields ? null : e.message);
      setSaving(false);
    }
  }

  if (!adding)
    return (
      <StepFrame title={t("onboarding.location.listTitle")}>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {b.locations.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3.5">
              {l.kind === "physical" ? <Store className="size-5 text-ink-3" /> : l.kind === "mobile" ? <MapPin className="size-5 text-ink-3" /> : <Monitor className="size-5 text-ink-3" />}
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-ink">{l.name}</p>
                <p className="truncate text-sm text-ink-3">{l.kind === "physical" ? [l.line1, l.city].filter(Boolean).join(", ") : l.kind === "mobile" ? t("onboarding.location.travelsFrom", { city: l.city ?? "" }) : t("onboarding.location.onlineSessions")}</p>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setAdding(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
          <Plus className="size-4" /> {t("onboarding.location.addAnother")}
        </button>
        <Actions>
          <Button size="lg" onClick={onDone}>
            {t("onboarding.continue")}
          </Button>
        </Actions>
      </StepFrame>
    );

  return (
    <StepFrame title={t("onboarding.location.title")} lead={t("onboarding.location.lead")}>
      <div className="grid gap-2 sm:grid-cols-3">
        {(
          [
            ["physical", Store],
            ["mobile", MapPin],
            ["virtual", Monitor],
          ] as const
        ).map(([k, Icon]) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("rounded-lg border px-3.5 py-3.5 text-start transition-[border-color,box-shadow]", kind === k ? "border-ink shadow-[0_0_0_1px_var(--ink)]" : "border-line bg-surface hover:border-line-strong")}>
            <Icon className="size-5 text-ink-2" />
            <span className="mt-3 block text-[15px] font-medium text-ink">{t(`onboarding.location.kind.${k}.title`)}</span>
            <span className="block text-[13px] text-ink-3">{t(`onboarding.location.kind.${k}.hint`)}</span>
          </button>
        ))}
      </div>
      <div className="mt-8 space-y-4">
        <FormError message={error} />
        {kind === "physical" && (
          <>
            <Field label={t("onboarding.location.placeName")} hint={t("onboarding.location.placeNameHint")}>{(p) => <Input {...p} value={form.name} onChange={set("name")} />}</Field>
            <Field label={t("onboarding.location.street")} error={fields.line1}>{(p) => <Input {...p} value={form.line1} onChange={set("line1")} autoComplete="address-line1" />}</Field>
            <Field label={t("onboarding.location.line2")} optional>{(p) => <Input {...p} value={form.line2} onChange={set("line2")} autoComplete="address-line2" />}</Field>
          </>
        )}
        {kind !== "virtual" && (
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label={t("onboarding.location.city")} error={fields.city}>{(p) => <Input {...p} value={form.city} onChange={set("city")} autoComplete="address-level2" />}</Field>
            <Field label={t("onboarding.location.region")} optional>{(p) => <Input {...p} value={form.region} onChange={set("region")} autoComplete="address-level1" />}</Field>
          </div>
        )}
        {kind === "physical" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("onboarding.location.postalCode")} optional>{(p) => <Input {...p} value={form.postalCode} onChange={set("postalCode")} autoComplete="postal-code" />}</Field>
            <Field label={t("onboarding.location.country")} hint={t("onboarding.location.countryHint")}>{(p) => <Input {...p} value={form.country} onChange={set("country")} maxLength={2} className="uppercase" />}</Field>
          </div>
        )}
        {kind === "mobile" && (
          <Field label={t("onboarding.location.radius")} error={fields.serviceRadiusKm}>
            {(p) => (
              <Select {...p} value={form.radius} onChange={(e) => setForm((f) => ({ ...f, radius: e.target.value }))}>
                {[5, 10, 15, 25, 40, 60, 100].map((r) => (
                  <option key={r} value={r}>
                    {t("onboarding.location.upToKm", { km: r })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {kind !== "virtual" && (
          <div className="rounded-lg bg-surface-2 p-4">
            <p className="text-sm font-medium text-ink">{t("onboarding.location.nearMe")}</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-3">{kind === "physical" ? t("onboarding.location.nearMePhysical") : t("onboarding.location.nearMeMobile")}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={pin} loading={locating} icon={coords ? <Check className="size-4 text-accent" /> : <LocateFixed className="size-4" />}>
              {coords ? t("onboarding.location.pinned") : t("onboarding.location.useCurrent")}
            </Button>
          </div>
        )}
      </div>
      <Actions back={b.locations.length ? () => setAdding(false) : undefined}>
        <Button size="lg" onClick={save} loading={saving}>
          {t("onboarding.saveContinue")}
        </Button>
      </Actions>
    </StepFrame>
  );
}

type DraftService = { key: string; name: string; duration: number; price: string };

function ServicesStep({ b, categorySlug, parentSlug, onDone }: { b: WizardBusiness; categorySlug: string | null; parentSlug: string | null; onDone: () => void }) {
  const t = useT("proSetup");
  const { intl } = useLocale();
  const templates = templatesFor(categorySlug, parentSlug).filter((tp) => !b.services.some((s) => s.name.toLowerCase() === tp.name.toLowerCase()));
  const [rows, setRows] = useState<DraftService[]>(() => (b.services.length ? [] : templates.slice(0, 2).map((tp, i) => ({ key: `t${i}`, name: tp.name, duration: tp.durationMinutes, price: "" }))));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const used = new Set(rows.map((r) => r.name.toLowerCase()));

  const update = (key: string, patch: Partial<DraftService>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function save() {
    const errs: Record<string, string> = {};
    for (const r of rows) {
      if (r.name.trim().length < 2) errs[r.key] = t("onboarding.services.errorName");
      else if (r.price.trim() === "" || parseMoneyInput(r.price) == null) errs[r.key] = t("onboarding.services.errorPrice");
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    let ok = 0;
    for (const r of rows) {
      try {
        const cents = parseMoneyInput(r.price)!;
        await api("/api/pro/services", {
          body: { name: r.name.trim(), durationMinutes: r.duration, priceType: cents === 0 ? "free" : "fixed", priceCents: cents, memberIds: [b.memberId] },
        });
        ok++;
        setSaved(ok);
        setRows((prev) => prev.filter((x) => x.key !== r.key));
      } catch (err) {
        setErrors((e) => ({ ...e, [r.key]: (err as ApiError).message }));
      }
    }
    setSaving(false);
    if (ok === rows.length && (b.services.length + ok) > 0) onDone();
  }

  return (
    <StepFrame title={t("onboarding.services.title")} lead={t("onboarding.services.lead")}>
      {b.services.length > 0 && (
        <ul className="mb-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {b.services.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Check className="size-4 text-accent" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{s.name}</span>
              <span className="text-sm text-ink-3 tabular">{formatDuration(s.durationMinutes, intl)}</span>
              <span className="w-16 text-end text-sm font-medium text-ink tabular">{s.priceType === "free" ? t("onboarding.services.free") : formatMoney(s.priceCents, b.currency, { compact: true, intl })}</span>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="rounded-lg border border-line bg-surface p-3.5">
              <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[1fr_120px_110px_auto] sm:items-end">
                <Field label={t("onboarding.services.service")} className="col-span-2 sm:col-span-1">{(p) => <Input {...p} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} maxLength={100} placeholder={t("onboarding.services.placeholder")} />}</Field>
                <Field label={t("onboarding.services.length")}>
                  {(p) => (
                    <Select {...p} value={r.duration} onChange={(e) => update(r.key, { duration: Number(e.target.value) })}>
                      {DURATION_CHOICES.map((d) => (
                        <option key={d} value={d}>
                          {formatDuration(d, intl)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("onboarding.services.price", { currency: b.currency })}>{(p) => <Input {...p} value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} inputMode="decimal" placeholder="0.00" />}</Field>
                <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="flex size-11 items-center justify-center self-end rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink md:size-10" aria-label={r.name ? t("onboarding.services.remove", { name: r.name }) : t("onboarding.services.removeEmpty")}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              {errors[r.key] && <p className="mt-2 text-[13px] text-danger">{errors[r.key]}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {templates
          .filter((tp) => !used.has(tp.name.toLowerCase()))
          .map((tp) => (
            <button key={tp.name} type="button" onClick={() => setRows((r) => [...r, { key: `${tp.name}-${Date.now()}`, name: tp.name, duration: tp.durationMinutes, price: "" }])} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3 text-sm text-ink-2 hover:border-ink hover:text-ink">
              <Plus className="size-3.5" /> {tp.name}
            </button>
          ))}
        <button type="button" onClick={() => setRows((r) => [...r, { key: `c${Date.now()}`, name: "", duration: 60, price: "" }])} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-surface-2 px-3 text-sm font-medium text-ink hover:bg-surface-3">
          <Plus className="size-3.5" /> {t("onboarding.services.custom")}
        </button>
      </div>

      <Actions>
        {rows.length === 0 && b.services.length > 0 ? (
          <Button size="lg" onClick={onDone}>
            {t("onboarding.continue")}
          </Button>
        ) : (
          <Button size="lg" onClick={save} loading={saving} disabled={rows.length === 0}>
            {saving ? t("onboarding.services.saving", { n: saved + 1, total: rows.length + saved }) : t("onboarding.services.save", { count: rows.length })}
          </Button>
        )}
      </Actions>
    </StepFrame>
  );
}

function HoursStep({ b, onDone }: { b: WizardBusiness; onDone: () => void }) {
  const t = useT("proSetup");
  const [hours, setHours] = useState<DayHours[]>(b.hours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = hoursAreValid(hours);
  const anyOpen = hours.some((d) => d.windows.length);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/pro/schedule/weekly", { method: "PUT", body: { memberId: b.memberId, days: hours.map((d) => ({ weekday: d.weekday, windows: d.windows })) } });
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
      setSaving(false);
    }
  }
  return (
    <StepFrame title={t("onboarding.hours.title")} lead={t("onboarding.hours.lead")}>
      <FormError message={error} />
      <WeeklyHoursEditor value={hours} onChange={setHours} />
      <Actions>
        <Button size="lg" onClick={save} loading={saving} disabled={!valid || !anyOpen}>
          {t("availability.saveHours")}
        </Button>
      </Actions>
    </StepFrame>
  );
}

function PoliciesStep({ b, onDone, onSkip }: { b: WizardBusiness; onDone: () => void; onSkip: () => void }) {
  const t = useT("proSetup");
  const noticeLabel = (m: number) => (m === 0 ? t("editor.none") : m < 60 ? t("onboarding.policies.minutes", { count: m }) : m < 1440 ? t("editor.notice.hours", { count: m / 60 }) : t("editor.notice.days", { count: m / 1440 }));
  const [mode, setMode] = useState(b.bookingMode);
  const [notice, setNotice] = useState(String(b.minNoticeMinutes));
  const [window_, setWindow] = useState(String(b.cancellationWindowHours));
  const [fee, setFee] = useState(String(b.lateCancelFeePercent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/pro/business/booking-rules", { method: "PUT", body: { bookingMode: mode, minNoticeMinutes: Number(notice) } });
      await api("/api/pro/business/policies", { method: "PUT", body: { cancellationWindowHours: Number(window_), rescheduleWindowHours: Number(window_), lateCancelFeePercent: Number(fee), noShowFeePercent: Number(fee) } });
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
      setSaving(false);
    }
  }
  return (
    <StepFrame title={t("onboarding.policies.title")} lead={t("onboarding.policies.lead")}>
      <FormError message={error} />
      <div className="space-y-8">
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-ink">{t("onboarding.policies.confirmations")}</legend>
          <div className="grid gap-2">
            <ChoiceCard selected={mode === "instant"} onClick={() => setMode("instant")} title={t("editor.rules.instant")} description={t("onboarding.policies.instantHint")} />
            <ChoiceCard selected={mode === "request"} onClick={() => setMode("request")} title={t("onboarding.policies.approve")} description={t("onboarding.policies.approveHint")} />
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t("editor.rules.minNotice")}>
            {(p) => (
              <Select {...p} value={notice} onChange={(e) => setNotice(e.target.value)}>
                {[0, 30, 60, 120, 240, 720, 1440, 2880].map((m) => (
                  <option key={m} value={String(m)}>
                    {noticeLabel(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("onboarding.policies.freeCancel")}>
            {(p) => (
              <Select {...p} value={window_} onChange={(e) => setWindow(e.target.value)}>
                {[0, 2, 6, 12, 24, 48].map((h) => (
                  <option key={h} value={String(h)}>
                    {h === 0 ? t("onboarding.policies.startTime") : t("onboarding.policies.hoursBefore", { hours: h })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("onboarding.policies.fee")}>
            {(p) => (
              <Select {...p} value={fee} onChange={(e) => setFee(e.target.value)}>
                {["0", "25", "50", "100"].map((v) => (
                  <option key={v} value={v}>
                    {v === "0" ? t("onboarding.policies.noFee") : t("onboarding.policies.percentOfTotal", { percent: v })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
      <Actions skip={onSkip}>
        <Button size="lg" onClick={save} loading={saving}>
          {t("onboarding.saveContinue")}
        </Button>
      </Actions>
    </StepFrame>
  );
}

function PaymentsStep({ b, stripe, onDone, onSkip }: { b: WizardBusiness; stripe: boolean; onDone: () => void; onSkip: () => void }) {
  const t = useT("proSetup");
  const [loading, setLoading] = useState(false);
  async function connect() {
    setLoading(true);
    try {
      const { url } = await api<{ url: string }>("/api/pro/payments/connect", { method: "POST", body: {} });
      window.location.href = url;
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  }
  return (
    <StepFrame title={t("onboarding.payments.title")} lead={t("onboarding.payments.lead")}>
      {b.paymentsEnabled ? (
        <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft p-4 text-sm text-accent-text">
          <Check className="size-5" /> {t("onboarding.payments.connected")}
        </div>
      ) : stripe ? (
        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="text-[15px] font-medium text-ink">{t("onboarding.payments.stripeTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-3">{t("onboarding.payments.stripeBody")}</p>
          <Button className="mt-4" onClick={connect} loading={loading}>
            {t("onboarding.payments.connect")}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="text-[15px] font-medium text-ink">{t("onboarding.payments.offTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-3">{t("onboarding.payments.offBody")}</p>
        </div>
      )}
      <Actions skip={!b.paymentsEnabled && stripe ? onSkip : undefined}>
        <Button size="lg" onClick={onDone} variant={!b.paymentsEnabled && stripe ? "secondary" : "primary"}>
          {t("onboarding.continue")}
        </Button>
      </Actions>
    </StepFrame>
  );
}

function PreviewStep({ b, goTo }: { b: WizardBusiness; goTo: (s: StepKey) => void }) {
  const t = useT("proSetup");
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = b.checklist.every((i) => i.done);
  const live = b.status === "active";
  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      await api("/api/pro/business/publish", { body: { live: true } });
      await api("/api/pro/business/onboarding", { body: { step: "preview" } });
      toast.success(t("onboarding.preview.live"), { description: t("onboarding.preview.liveToast") });
      router.push("/pro/today");
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
      setPublishing(false);
    }
  }
  return (
    <StepFrame title={live ? t("onboarding.preview.live") : ready ? t("onboarding.preview.ready") : t("onboarding.preview.almost")} lead={live ? t("onboarding.preview.liveLead") : t("onboarding.preview.lead")}>
      <FormError message={error} />
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {b.checklist.map((i) => (
          <li key={i.key} className="flex items-center gap-3 px-4 py-3.5">
            <span className={cn("flex size-6 items-center justify-center rounded-full", i.done ? "bg-accent text-accent-ink" : "border border-line-strong text-ink-3")}>{i.done ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" />}</span>
            <span className={cn("flex-1 text-[15px]", i.done ? "text-ink" : "text-ink-2")}>{tOr(t, `onboarding.checklist.${i.key}`, i.label)}</span>
            {!i.done && (
              <button type="button" onClick={() => goTo(i.key as StepKey)} className="text-sm font-medium text-ink underline underline-offset-4">
                {t("onboarding.preview.finish")}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between gap-4 rounded-lg bg-surface-2 px-4 py-3.5">
        <span className="min-w-0 truncate text-sm text-ink-2">kept.app/{b.slug}</span>
        <a href={`/${b.slug}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink hover:underline">
          {t("onboarding.preview.preview")} <ExternalLink className="size-3.5" />
        </a>
      </div>
      <Actions>
        {live ? (
          <ButtonLink href="/pro/today" size="lg">
            {t("onboarding.preview.goToDay")}
          </ButtonLink>
        ) : (
          <Button size="lg" onClick={publish} loading={publishing} disabled={!ready}>
            {t("onboarding.preview.goLive")}
          </Button>
        )}
      </Actions>
    </StepFrame>
  );
}
