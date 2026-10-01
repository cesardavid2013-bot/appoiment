"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarCheck, Check, ChevronLeft, ChevronRight, Clock, MapPin, Tag, Users, X, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { BookingServiceDetail, PublicLocation, PublicService } from "@/server/services/catalog";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceCard } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar, type MediaLike } from "@/components/ui/media";
import { Skeleton } from "@/components/ui/misc";
import { addDaysIso, todayIn } from "@/domain/time";
import { formatDuration, formatMoney, formatPriceLabel } from "@/domain/money";
import { describeCancellationPolicy, type PolicyAppointment } from "@/domain/policies";
import { computeQuote, eligibleMembersFor, resolveSelection, type PriceType, type Quote } from "@/domain/pricing";
import { useLocale, useT } from "@/i18n/client";
import { priceWords } from "@/i18n/helpers";
import type { TFunction } from "@/i18n/translate";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateLong, fmtTime, localDateKey, tzAbbr } from "@/lib/format";
import { InlineAuth } from "./inline-auth";
import { IntakeField } from "./intake-field";

const StripeCheckout = dynamic(() => import("./stripe-checkout"), { ssr: false });

type FlowBusiness = {
  id: string;
  slug: string;
  name: string;
  kind: "individual" | "business";
  timezone: string;
  currency: string;
  bookingMode: "instant" | "request";
  allowAnyStaff: boolean;
  policy: CancellationPolicy;
  latePolicy: string | null;
  logo: MediaLike | null;
  services: PublicService[];
  team: { id: string; name: string; title: string | null; avatar: MediaLike | null }[];
  locations: PublicLocation[];
};

type Slot = { start: string; memberIds: string[]; spotsLeft?: number };
type SlotsResponse = { timezone: string; locationId: string | null; days: { date: string; slots: Slot[] }[] };
type CancellationPolicy = PolicyAppointment["policy"];
type QuoteResponse = { quote: Quote; promoError: string | null; requiresApproval: boolean; policies: string[]; policy?: CancellationPolicy; latePolicy: string | null; bookingInstructions: string | null };
type StepKey = "service" | "options" | "who" | "time" | "details" | "review";
type GroupLike = { name: string; required: boolean; selection: string; maxSelect: number | null };

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
/** A calendar day ("2026-10-01") formatted in the viewer's language. */
const fmtDay = (iso: string, intl: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intl, { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const signedMoney = (cents: number, currency: string, intl: string) => `${cents > 0 ? "+" : "−"}${formatMoney(Math.abs(cents), currency, { compact: true, intl })}`;

export function BookingFlow({
  business: b,
  initialDetail,
  initialStart,
  initialDate,
  viewer,
  google,
}: {
  business: FlowBusiness;
  initialDetail: BookingServiceDetail | null;
  initialStart: string | null;
  initialDate: string | null;
  viewer: { name: string; email: string | null; emailVerified: boolean } | null;
  google: boolean;
}) {
  const router = useRouter();
  const tr = useT();
  const t = useT("booking");
  const { intl } = useLocale();
  const [detail, setDetail] = useState<BookingServiceDetail | null>(initialDetail);
  const [loadingService, setLoadingService] = useState(false);
  const [optionIds, setOptionIds] = useState<string[]>(() => defaultOptions(initialDetail));
  const [memberChoice, setMemberChoice] = useState<string>("any");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [dateChoice, setDate] = useState<string | null>(initialDate ?? (initialStart ? localDateKey(initialStart, b.timezone) : null));
  const [startChoice, setStart] = useState<string | null>(initialStart);
  const [intake, setIntake] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkout, setCheckout] = useState<{ appointmentId: string; clientSecret: string; publishableKey: string; amount: number } | null>(null);
  const idemKey = useRef<string>(newIdempotencyKey());

  const service = detail ? b.services.find((s) => s.id === detail.id) ?? null : null;


  /* ── Derived: locations, staff eligibility, selection ── */
  const serviceLocations = useMemo(() => {
    if (!service) return [];
    return service.locationIds.length ? b.locations.filter((l) => service.locationIds.includes(l.id)) : b.locations;
  }, [service, b.locations]);
  const effectiveLocationId = locationId ?? (serviceLocations.length === 1 ? serviceLocations[0].id : null);
  const effectiveLocation = serviceLocations.find((l) => l.id === effectiveLocationId) ?? null;

  const selection = useMemo(() => {
    if (!detail) return null;
    const groups = detail.optionGroups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, isActive: true })) }));
    return resolveSelection(groups, optionIds);
  }, [detail, optionIds]);

  const eligibleStaff = useMemo(() => {
    if (!detail) return [];
    const atLocation = detail.staff.filter((s) => !effectiveLocationId || s.locationIds.length === 0 || s.locationIds.includes(effectiveLocationId));
    const ids = eligibleMembersFor(
      atLocation.map((s) => s.memberId),
      selection?.ok ? selection.selected : [],
    );
    return b.team.filter((t) => ids.includes(t.id));
  }, [detail, effectiveLocationId, selection, b.team]);

  // A chosen professional who can't do the current options/location falls back to "any".
  const memberId = memberChoice !== "any" && !eligibleStaff.some((s) => s.id === memberChoice) ? (b.allowAnyStaff || eligibleStaff.length !== 1 ? "any" : (eligibleStaff[0]?.id ?? "any")) : memberChoice;

  const staffPick = memberId === "any" && !b.allowAnyStaff && eligibleStaff.length > 1 ? null : memberId;

  const estimate = useMemo(() => {
    if (!detail || !selection?.ok) return null;
    const staff = memberId !== "any" ? detail.staff.find((s) => s.memberId === memberId) : null;
    return computeQuote({
      currency: b.currency,
      serviceName: detail.name,
      service: { priceType: detail.priceType as PriceType, priceCents: detail.priceCents, salePriceCents: detail.salePriceCents, priceMaxCents: detail.priceMaxCents, durationMinutes: detail.durationMinutes, paymentPolicy: "pay_later", depositType: null, depositValue: null },
      staffOverride: staff ? { priceCents: staff.priceCentsOverride, durationMinutes: staff.durationMinutesOverride } : null,
      selected: selection.selected,
      taxRateBps: 0,
      customerFeeBps: 0,
      paymentsEnabled: false,
    });
  }, [detail, selection, memberId, b.currency]);

  const needsDetails = Boolean(detail && (detail.intakeFields.length > 0 || detail.consentText || detail.minAge || effectiveLocation?.kind === "mobile"));

  const steps = useMemo<StepKey[]>(() => {
    const list: StepKey[] = [];
    if (b.services.length > 1 || !detail) list.push("service");
    if (detail && detail.optionGroups.length > 0) list.push("options");
    if (detail && (serviceLocations.length > 1 || eligibleStaff.length > 1)) list.push("who");
    list.push("time");
    if (needsDetails) list.push("details");
    list.push("review");
    return list;
  }, [b.services.length, detail, serviceLocations.length, eligibleStaff.length, needsDetails]);

  const firstIncomplete = (): StepKey => {
    if (!detail) return "service";
    if (detail.optionGroups.length > 0 && !(selection?.ok ?? false)) return "options";
    if (serviceLocations.length > 1 && !effectiveLocationId) return "who";
    if (detail.optionGroups.length > 0 && !initialStart) return "options";
    return "time";
  };
  const [step, setStep] = useState<StepKey>(() => (initialDetail ? (initialDetail.optionGroups.length ? "options" : "time") : "service"));
  const stepIndex = Math.max(0, steps.indexOf(step));

  function go(next: StepKey) {
    setStep(next);
    setSubmitError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function nextStep() {
    const i = steps.indexOf(step);
    if (i < steps.length - 1) go(steps[i + 1]);
  }
  function back() {
    const i = steps.indexOf(step);
    if (i > 0) go(steps[i - 1]);
    else router.push(`/${b.slug}`);
  }

  async function chooseService(id: string) {
    if (detail?.id === id) {
      go(firstIncomplete());
      return;
    }
    setLoadingService(true);
    try {
      const d = await api<BookingServiceDetail>(`/api/services/${id}`);
      setDetail(d);
      setOptionIds(defaultOptions(d));
      setStart(null);
      setIntake({});
      setPromoCode(null);
      setStep(d.optionGroups.length ? "options" : steps.includes("who") ? "who" : "time");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingService(false);
    }
  }

  /* ── Time ── */
  const [windowStart, setWindowStart] = useState(() => (dateChoice && dateChoice > todayIn(b.timezone) ? dateChoice : todayIn(b.timezone)));
  const windowEnd = addDaysIso(windowStart, 13);
  const slotsKey = ["slots", detail?.id, staffPick, effectiveLocationId, optionIds.slice().sort().join(","), windowStart] as const;
  const slotsQuery = useQuery({
    queryKey: slotsKey,
    enabled: Boolean(detail && selection?.ok && staffPick && (serviceLocations.length <= 1 || effectiveLocationId) && (step === "time" || step === "review" || step === "details")),
    queryFn: ({ signal }) => {
      const p = new URLSearchParams({ serviceId: detail!.id, memberId: staffPick!, from: windowStart, to: windowEnd });
      if (effectiveLocationId) p.set("locationId", effectiveLocationId);
      for (const o of optionIds) p.append("options", o);
      return api<SlotsResponse>(`/api/slots?${p}`, { signal });
    },
    staleTime: 20_000,
    refetchInterval: step === "time" ? 60_000 : false,
  });
  const tz = slotsQuery.data?.timezone ?? effectiveLocation?.timezone ?? b.timezone;
  const days = slotsQuery.data?.days ?? [];
  // Default the date to the first day with openings.
  const date = dateChoice ?? (slotsQuery.data ? (days.find((d) => d.slots.length)?.date ?? windowStart) : null);
  const daySlots = days.find((d) => d.date === date)?.slots ?? [];

  // Keep the selected time honest: a time that vanished from availability is no longer selected.
  const startStillOpen = (() => {
    if (!startChoice || !slotsQuery.data) return true;
    const key = localDateKey(startChoice, tz);
    if (key < windowStart || key > windowEnd) return true;
    return slotsQuery.data.days.some((d) => d.slots.some((s) => s.start === startChoice));
  })();
  const start = startStillOpen ? startChoice : null;
  const preselectMissed = Boolean(initialStart && startChoice === initialStart && !startStillOpen);

  /* ── Quote (authoritative, from the server) ── */
  const quoteQuery = useQuery({
    queryKey: ["quote", detail?.id, memberId, effectiveLocationId, optionIds.slice().sort().join(","), promoCode],
    enabled: Boolean(detail && selection?.ok && step === "review"),
    // Prices and codes can change while someone is booking; always re-check on return to review.
    staleTime: 0,
    queryFn: () =>
      api<QuoteResponse>("/api/quote", { body: { serviceId: detail!.id, memberId, locationId: effectiveLocationId, optionIds, promoCode } }),
  });
  // A code the server rejects is shown as an error and never sent with the booking.
  const promoRejected = Boolean(promoCode && quoteQuery.data?.promoError);
  const appliedPromo = promoRejected ? null : promoCode;
  const promoError = fieldErrors.promoCode || (promoRejected ? quoteQuery.data!.promoError : null);

  // Any change to what is being booked invalidates the previous submit attempt.
  useEffect(() => {
    idemKey.current = newIdempotencyKey();
  }, [detail?.id, optionIds, memberId, locationId, start, appliedPromo]);

  /* ── Submit ── */
  async function submit() {
    if (!detail || !start || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const res = await api<{ appointmentId: string; status: string; checkout: { clientSecret: string; publishableKey: string; expiresAt: string } | null; dueNowCents: number }>("/api/bookings", {
        body: {
          serviceId: detail.id,
          memberId,
          locationId: effectiveLocationId,
          start,
          optionIds,
          intake,
          consent: detail.consentText ? consent : undefined,
          ageConfirmed: detail.minAge ? ageConfirmed : undefined,
          customerNote: note.trim() || null,
          serviceAddress: effectiveLocation?.kind === "mobile" ? address.trim() : null,
          promoCode: appliedPromo,
          idempotencyKey: idemKey.current,
          source: document.referrer.includes(window.location.host) ? "marketplace" : "direct_link",
        },
      });
      if (res.checkout) {
        setCheckout({ appointmentId: res.appointmentId, clientSecret: res.checkout.clientSecret, publishableKey: res.checkout.publishableKey, amount: res.dueNowCents });
        setSubmitting(false);
        return;
      }
      router.push(`/bookings/${res.appointmentId}?new=1`);
    } catch (err) {
      const e = err as ApiError;
      setSubmitting(false);
      if (e.code === "slot_unavailable") {
        setStart(null);
        await slotsQuery.refetch();
        go("time");
        toast.error(e.message);
        return;
      }
      if (e.fields && Object.keys(e.fields).some((k) => k.startsWith("intake.") || ["serviceAddress", "consent", "ageConfirmed"].includes(k))) {
        setFieldErrors(e.fields);
        go("details");
        return;
      }
      if (e.fields?.promoCode) {
        setFieldErrors(e.fields);
        setPromoCode(null);
      }
      if (e.code === "unauthenticated") router.refresh();
      setSubmitError(e.message);
    }
  }

  /* ── Step validity ── */
  const canContinue = (() => {
    switch (step) {
      case "service":
        return Boolean(detail);
      case "options":
        return Boolean(selection?.ok);
      case "who":
        return Boolean(staffPick) && (serviceLocations.length <= 1 || Boolean(effectiveLocationId));
      case "time":
        return Boolean(start);
      case "details":
        return detailsMissing(detail, intake, consent, ageConfirmed, effectiveLocation, address).length === 0;
      default:
        return true;
    }
  })();

  const memberName = memberId === "any" ? null : b.team.find((t) => t.id === memberId)?.name;
  const showStaffInfo = b.kind === "business" && b.team.length > 1;

  /* ── Render ── */
  return (
    <div className="pb-32 lg:pb-16">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md safe-top">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={back} className="-ms-2 flex size-10 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={stepIndex === 0 ? t("header.backTo", { name: b.name }) : t("header.previousStep")}>
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink-3">{b.name}</p>
            <p className="truncate text-[15px] font-semibold text-ink">{t(`steps.${step}`)}</p>
          </div>
          <span className="shrink-0 text-[13px] text-ink-3 tabular">
            {t("header.stepOf", { current: stepIndex + 1, total: steps.length })}
          </span>
          <Link href={`/${b.slug}`} className="ms-1 hidden size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink sm:flex" aria-label={t("header.exit")}>
            <X className="size-5" />
          </Link>
        </div>
        <div className="h-0.5 bg-line" aria-hidden>
          <div className="h-full bg-ink transition-[width] duration-300 ease-out" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div className="min-w-0 animate-rise" key={step}>
          {step === "service" && (
            <ServiceStep services={b.services} currency={b.currency} t={tr} selectedId={detail?.id ?? null} loading={loadingService} onSelect={chooseService} />
          )}

          {step === "options" && detail && (
            <div className="space-y-9">
              {detail.optionGroups.map((g) => {
                const chosen = optionIds.filter((id) => g.options.some((o) => o.id === id));
                const error = selection && !selection.ok ? optionGroupError(t, g, chosen.length, selection.errors.find((e) => e.groupId === g.id)?.message) : null;
                return (
                  <fieldset key={g.id}>
                    <legend className="mb-1 flex w-full items-baseline justify-between gap-3">
                      <span className="text-[17px] font-semibold text-ink">{g.name}</span>
                      <span className="text-[13px] text-ink-3">{g.required ? t("options.required") : g.selection === "multiple" ? (g.maxSelect ? t("options.upTo", { count: g.maxSelect }) : t("options.optionalAny")) : t("options.optional")}</span>
                    </legend>
                    {g.description && <p className="mb-3 text-sm text-ink-3">{g.description}</p>}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2" role={g.selection === "single" ? "radiogroup" : "group"} aria-label={g.name}>
                      {g.options.map((o) => {
                        const on = chosen.includes(o.id);
                        const atMax = g.selection === "multiple" && g.maxSelect != null && chosen.length >= g.maxSelect && !on;
                        const extras = [o.priceDeltaCents ? signedMoney(o.priceDeltaCents, b.currency, intl) : null, o.durationDeltaMinutes ? `${o.durationDeltaMinutes > 0 ? "+" : "−"}${formatDuration(Math.abs(o.durationDeltaMinutes), intl)}` : null].filter(Boolean).join(" · ");
                        return (
                          <ChoiceCard
                            key={o.id}
                            role={g.selection === "single" ? "radio" : "checkbox"}
                            selected={on}
                            disabled={atMax}
                            title={o.name}
                            description={o.description ?? undefined}
                            aside={extras || t("options.included")}
                            onClick={() =>
                              setOptionIds((prev) => {
                                const without = prev.filter((id) => !g.options.some((x) => x.id === id));
                                if (g.selection === "single") return on && !g.required ? without : [...without, o.id];
                                return on ? prev.filter((id) => id !== o.id) : [...prev, o.id];
                              })
                            }
                          />
                        );
                      })}
                    </div>
                    {error && optionIds.length > 0 && <p className="mt-2 text-[13px] text-danger">{error}</p>}
                  </fieldset>
                );
              })}
            </div>
          )}

          {step === "who" && detail && (
            <div className="space-y-10">
              {serviceLocations.length > 1 && (
                <fieldset>
                  <legend className="mb-3 text-[17px] font-semibold text-ink">{t("who.where")}</legend>
                  <div className="grid gap-2">
                    {serviceLocations.map((l) => (
                      <ChoiceCard key={l.id} selected={effectiveLocationId === l.id} onClick={() => { setLocationId(l.id); setStart(null); }} title={l.name} description={l.kind === "physical" ? l.address : l.kind === "mobile" ? t("who.comesToYou", { km: l.serviceRadiusKm, city: l.city }) : t("who.online")} />
                    ))}
                  </div>
                </fieldset>
              )}
              {eligibleStaff.length > 1 && (
                <fieldset>
                  <legend className="mb-3 text-[17px] font-semibold text-ink">{t("who.with")}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {b.allowAnyStaff && (
                      <ChoiceCard selected={memberId === "any"} onClick={() => { setMemberChoice("any"); setStart(null); }} title={t("who.anyPro")} description={t("who.anyProHint")} />
                    )}
                    {eligibleStaff.map((s) => {
                      const st = detail.staff.find((x) => x.memberId === s.id);
                      return (
                        <ChoiceCard
                          key={s.id}
                          selected={memberId === s.id}
                          onClick={() => { setMemberChoice(s.id); setStart(null); }}
                          title={
                            <span className="flex items-center gap-2.5">
                              <Avatar name={s.name} media={s.avatar} size={28} />
                              {s.name}
                            </span>
                          }
                          description={s.title ?? undefined}
                          aside={st?.priceCentsOverride != null ? formatMoney(st.priceCentsOverride, b.currency, { compact: true, intl }) : undefined}
                        />
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {step === "time" && detail && (
            <TimeStep
              tz={tz}
              businessTz={b.timezone}
              windowStart={windowStart}
              setWindowStart={(d) => { setWindowStart(d); setDate(null); }}
              days={days}
              loading={slotsQuery.isLoading}
              error={slotsQuery.error as Error | null}
              date={date}
              setDate={(d) => { setDate(d); }}
              slots={daySlots}
              start={start}
              setStart={(s) => setStart(s)}
              preselectMissed={preselectMissed}
              showStaff={showStaffInfo && memberId === "any"}
              team={b.team}
              serviceId={detail.id}
              memberId={memberId}
              isGroup={detail.capacity > 1}
              businessSlug={b.slug}
            />
          )}

          {step === "details" && detail && (
            <div className="space-y-6">
              {effectiveLocation?.kind === "mobile" && (
                <Field label={t("details.addressLabel")} hint={t("details.addressHint", { km: effectiveLocation.serviceRadiusKm, city: effectiveLocation.city })} error={fieldErrors.serviceAddress}>
                  {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" placeholder={t("details.addressPlaceholder")} />}
                </Field>
              )}
              {detail.intakeFields.map((f) => (
                <IntakeField key={f.id} field={f} value={intake[f.id]} onChange={(v) => setIntake((prev) => ({ ...prev, [f.id]: v }))} error={fieldErrors[`intake.${f.id}`]} />
              ))}
              {detail.consentText && (
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="mb-3 max-h-40 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink-2">{detail.consentText}</p>
                  <Checkbox checked={consent} onCheckedChange={setConsent} label={t("details.consent")} />
                  {fieldErrors.consent && <p className="mt-1 text-[13px] text-danger">{fieldErrors.consent}</p>}
                </div>
              )}
              {detail.minAge && <Checkbox checked={ageConfirmed} onCheckedChange={setAgeConfirmed} label={t("details.age", { age: detail.minAge })} />}
              <Field label={t("details.noteLabel")} optional>
                {(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t("details.notePlaceholder")} />}
              </Field>
            </div>
          )}

          {step === "review" && detail && start && (
            <div className="space-y-8">
              <section className="rounded-xl border border-line bg-surface">
                <div className="flex items-start gap-4 p-5">
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-2 leading-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{new Intl.DateTimeFormat(intl, { month: "short", timeZone: tz }).format(new Date(start))}</span>
                    <span className="mt-0.5 text-lg font-semibold text-ink">{new Intl.DateTimeFormat(intl, { day: "numeric", timeZone: tz }).format(new Date(start))}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-semibold text-ink">{cap(fmtDateLong(start, tz, intl))}</p>
                    <p className="text-[15px] text-ink-2">
                      {fmtTime(start, tz, intl)} – {fmtTime(new Date(new Date(start).getTime() + (estimate?.durationMinutes ?? detail.durationMinutes) * 60_000), tz, intl)} <span className="text-ink-3">{tzAbbr(start, tz, intl)}</span>
                    </p>
                    <button type="button" onClick={() => go("time")} className="mt-1 text-sm font-medium text-ink underline underline-offset-4">
                      {t("review.changeTime")}
                    </button>
                  </div>
                </div>
                <dl className="divide-y divide-line border-t border-line text-sm">
                  {showStaffInfo && (
                    <div className="flex justify-between gap-4 px-5 py-3">
                      <dt className="text-ink-3">{t("review.with")}</dt>
                      <dd className="text-end text-ink">{memberName ?? t("who.anyPro")}</dd>
                    </div>
                  )}
                  {effectiveLocation && (
                    <div className="flex justify-between gap-4 px-5 py-3">
                      <dt className="text-ink-3">{t("review.where")}</dt>
                      <dd className="text-end text-ink">{effectiveLocation.kind === "physical" ? effectiveLocation.address : effectiveLocation.kind === "mobile" ? address || t("review.yourAddress") : t("review.online")}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {!needsDetails && (
                <Field label={t("review.noteLabel")} optional>
                  {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t("review.notePlaceholder")} />}
                </Field>
              )}

              <PriceBreakdown quoteQuery={quoteQuery} currency={b.currency} t={t} intl={intl} />

              <div>
                {appliedPromo ? (
                  <div className="flex items-center justify-between rounded-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-2 font-medium text-accent-text">
                      <Tag className="size-4" /> {quoteQuery.isFetching ? `${appliedPromo} …` : t("review.promoApplied", { code: appliedPromo })}
                    </span>
                    <button type="button" onClick={() => setPromoCode(null)} className="text-accent-text underline underline-offset-2">
                      {t("review.promoRemove")}
                    </button>
                  </div>
                ) : (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setFieldErrors((f) => ({ ...f, promoCode: "" }));
                      const code = promoInput.trim().toUpperCase();
                      if (!code) return;
                      // Re-applying the same code re-checks it (the business may have just switched it on).
                      if (code === promoCode) void quoteQuery.refetch();
                      else setPromoCode(code);
                    }}
                  >
                    <Input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder={t("review.promoPlaceholder")} aria-label={t("review.promoPlaceholder")} className="uppercase" maxLength={40} />
                    <Button type="submit" variant="secondary" disabled={!promoInput.trim()}>
                      {t("review.promoApply")}
                    </Button>
                  </form>
                )}
                {promoError && <p className="mt-1.5 text-[13px] text-danger">{promoError}</p>}
              </div>

              <section className="rounded-lg bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
                <p className="mb-1.5 font-medium text-ink">{t("review.beforeYouBook")}</p>
                <ul className="space-y-1">
                  {describeCancellationPolicy(quoteQuery.data?.policy ?? b.policy, tr).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {(quoteQuery.data?.latePolicy ?? b.latePolicy) && <li>{quoteQuery.data?.latePolicy ?? b.latePolicy}</li>}
                  {quoteQuery.data?.bookingInstructions && <li>{quoteQuery.data.bookingInstructions}</li>}
                </ul>
              </section>

              {!viewer ? (
                <InlineAuth google={google} onDone={() => router.refresh()} />
              ) : (
                <div className="space-y-3">
                  <FormError message={submitError} />
                  <Button size="lg" className="hidden w-full lg:flex" onClick={submit} loading={submitting}>
                    {confirmLabel(t, intl, quoteQuery.data, b.bookingMode)}
                  </Button>
                  <p className="text-center text-[12px] text-ink-3">
                    {t("review.bookingAs", { name: viewer.name })}
                    {viewer.email ? ` · ${viewer.email}` : ""}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <aside className="hidden lg:block" aria-label={t("summary.label")}>
          <div className="sticky top-24 rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <Avatar name={b.name} media={b.logo} size={40} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">{b.name}</p>
                <p className="flex items-center gap-1 text-[12px] text-ink-3">
                  {b.bookingMode === "instant" ? <Zap className="size-3.5 text-accent" /> : <Clock className="size-3.5" />}
                  {b.bookingMode === "instant" ? t("summary.instant") : t("summary.request")}
                </p>
              </div>
            </div>
            {detail ? (
              <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-ink">{detail.name}</span>
                  <span className="shrink-0 text-ink tabular">{formatPriceLabel({ ...detail, priceCents: estimate?.lines[0]?.amountCents ?? detail.priceCents, salePriceCents: null }, b.currency, { intl, words: priceWords(tr) })}</span>
                </div>
                {selection?.ok &&
                  selection.selected.map((o) => (
                    <div key={o.id} className="flex justify-between gap-3 text-ink-2">
                      <span>{o.name}</span>
                      <span className="shrink-0 tabular">{o.priceDeltaCents ? signedMoney(o.priceDeltaCents, b.currency, intl) : ""}</span>
                    </div>
                  ))}
                <div className="space-y-1.5 pt-1 text-[13px] text-ink-3">
                  {estimate && (
                    <p className="flex items-center gap-2">
                      <Clock className="size-4" /> {formatDuration(estimate.durationMinutes, intl)}
                    </p>
                  )}
                  {start && (
                    <p className="flex items-center gap-2">
                      <CalendarCheck className="size-4" /> {cap(fmtDateLong(start, tz, intl))}, {fmtTime(start, tz, intl)}
                    </p>
                  )}
                  {showStaffInfo && staffPick && (
                    <p className="flex items-center gap-2">
                      <Users className="size-4" /> {memberName ?? t("who.anyPro")}
                    </p>
                  )}
                  {effectiveLocation && (
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0" /> {effectiveLocation.kind === "physical" ? effectiveLocation.address : effectiveLocation.kind === "mobile" ? t("summary.comesToYou") : t("summary.online")}
                    </p>
                  )}
                </div>
                {estimate && (
                  <div className="flex items-baseline justify-between border-t border-line pt-3">
                    <span className="text-ink-2">{step === "review" && quoteQuery.data ? t("summary.total") : t("summary.estimatedTotal")}</span>
                    <span className="text-lg font-semibold text-ink tabular">
                      {formatMoney(step === "review" && quoteQuery.data ? quoteQuery.data.quote.totalCents : estimate.subtotalCents, b.currency, { intl })}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-5 border-t border-line pt-4 text-sm text-ink-3">{t("summary.empty")}</p>
            )}
            {step !== "review" && (
              <Button size="lg" className="mt-5 w-full" disabled={!canContinue} onClick={nextStep}>
                {t("summary.continue")}
              </Button>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <div className="min-w-0 flex-1">
            {estimate ? (
              <>
                <p className="text-[12px] text-ink-3">{step === "review" && quoteQuery.data ? t("summary.total") : t("summary.estimated")} · {formatDuration(estimate.durationMinutes, intl)}</p>
                <p className="text-[17px] font-semibold text-ink tabular">{formatMoney(step === "review" && quoteQuery.data ? quoteQuery.data.quote.totalCents : estimate.subtotalCents, b.currency, { intl })}</p>
              </>
            ) : (
              <p className="text-sm text-ink-3">{b.name}</p>
            )}
          </div>
          {step === "review" ? (
            viewer ? (
              <Button size="lg" onClick={submit} loading={submitting} className="min-w-40">
                {confirmLabel(t, intl, quoteQuery.data, b.bookingMode, true)}
              </Button>
            ) : (
              <a href="#auth" className="inline-flex h-12 items-center rounded-lg bg-ink px-5 text-[15px] font-medium text-bg">
                {t("summary.signInToBook")}
              </a>
            )
          ) : (
            <Button size="lg" disabled={!canContinue} onClick={nextStep} className="min-w-36">
              {t("summary.continue")}
            </Button>
          )}
        </div>
      </div>

      {checkout && (
        <StripeCheckout
          clientSecret={checkout.clientSecret}
          publishableKey={checkout.publishableKey}
          amountLabel={formatMoney(checkout.amount, b.currency, { intl })}
          returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/bookings/${checkout.appointmentId}?new=1`}
          onClose={() => router.push(`/bookings/${checkout.appointmentId}`)}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── Pieces ───────────────────────────── */

function defaultOptions(d: BookingServiceDetail | null): string[] {
  if (!d) return [];
  const ids: string[] = [];
  for (const g of d.optionGroups) {
    const def = g.options.filter((o) => o.isDefault);
    if (g.selection === "single" && def[0]) ids.push(def[0].id);
    if (g.selection === "multiple") ids.push(...def.map((o) => o.id));
  }
  return ids;
}

function detailsMissing(d: BookingServiceDetail | null, intake: Record<string, unknown>, consent: boolean, age: boolean, loc: PublicLocation | null, address: string) {
  if (!d) return ["service"];
  const missing: string[] = [];
  for (const f of d.intakeFields) {
    if (!f.required) continue;
    const v = intake[f.id];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0) || (f.type === "acknowledgement" && v !== true)) missing.push(f.id);
  }
  if (d.consentText && !consent) missing.push("consent");
  if (d.minAge && !age) missing.push("age");
  if (loc?.kind === "mobile" && address.trim().length < 5) missing.push("address");
  return missing;
}

function confirmLabel(t: TFunction, intl: string, q: QuoteResponse | undefined, mode: "instant" | "request", short = false) {
  if (q?.requiresApproval ?? mode === "request") return short ? t("confirm.requestShort") : t("confirm.request");
  if (q && q.quote.dueNowCents > 0) return t(short ? "confirm.payShort" : "confirm.pay", { amount: formatMoney(q.quote.dueNowCents, q.quote.currency, { intl }) });
  return short ? t("confirm.confirmShort") : t("confirm.confirm");
}

/** The option-group problem in the viewer's language (the domain check words it in English). */
function optionGroupError(t: TFunction, g: GroupLike, count: number, fallback: string | undefined) {
  if (!fallback) return null;
  if (g.required && count === 0) return t("options.errorRequired", { name: g.name });
  if (g.selection === "single" && count > 1) return t("options.errorOnlyOne", { name: g.name });
  if (g.selection === "multiple" && g.maxSelect != null && count > g.maxSelect) return t("options.errorUpTo", { count: g.maxSelect, name: g.name });
  return t("options.errorUnavailable");
}

function ServiceStep({ services, currency, t: tr, selectedId, loading, onSelect }: { services: PublicService[]; currency: string; t: TFunction; selectedId: string | null; loading: boolean; onSelect: (id: string) => void }) {
  const { intl } = useLocale();
  const t = (key: string, vars?: Record<string, number>) => tr(`booking.service.${key}`, vars);
  const sections = [...new Set(services.map((s) => s.menuSection ?? ""))];
  return (
    <div className="space-y-8" aria-busy={loading}>
      {sections.map((section) => (
        <div key={section || "default"}>
          {section && sections.length > 1 && <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{section}</h2>}
          <div className="grid gap-2">
            {services
              .filter((s) => (s.menuSection ?? "") === section)
              .map((s) => (
                <ChoiceCard
                  key={s.id}
                  selected={selectedId === s.id}
                  onClick={() => onSelect(s.id)}
                  disabled={loading}
                  title={s.name}
                  description={[formatDuration(s.durationMinutes, intl), s.hasOptions ? t("optionsAvailable") : null, s.capacity > 1 ? t("group", { count: s.capacity }) : null].filter(Boolean).join(" · ")}
                  aside={formatPriceLabel(s, currency, { intl, words: priceWords(tr) })}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimeStep(p: {
  tz: string;
  businessTz: string;
  windowStart: string;
  setWindowStart: (d: string) => void;
  days: { date: string; slots: Slot[] }[];
  loading: boolean;
  error: Error | null;
  date: string | null;
  setDate: (d: string) => void;
  slots: Slot[];
  start: string | null;
  setStart: (s: string) => void;
  preselectMissed: boolean;
  showStaff: boolean;
  team: { id: string; name: string }[];
  serviceId: string;
  memberId: string;
  isGroup: boolean;
  businessSlug: string;
}) {
  const t = useT("booking.time");
  const { intl } = useLocale();
  const [waitOpen, setWaitOpen] = useState(false);
  const today = todayIn(p.businessTz);
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : p.tz;
  const differentTz = browserTz !== p.tz;
  const groups = [
    { key: "morning", slots: p.slots.filter((s) => hourIn(s.start, p.tz) < 12) },
    { key: "afternoon", slots: p.slots.filter((s) => hourIn(s.start, p.tz) >= 12 && hourIn(s.start, p.tz) < 17) },
    { key: "evening", slots: p.slots.filter((s) => hourIn(s.start, p.tz) >= 17) },
  ].filter((g) => g.slots.length);
  const dates = Array.from({ length: 14 }, (_, i) => addDaysIso(p.windowStart, i));

  return (
    <div>
      {p.preselectMissed && (
        <div className="mb-5 rounded-md border border-warn/25 bg-warn-soft px-3.5 py-3 text-sm text-warn" role="status">
          {t("preselectMissed")}
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink">{cap(fmtDay(p.date ?? p.windowStart, intl, { month: "long", year: "numeric" }))}</p>
        <div className="flex gap-1">
          <button type="button" disabled={p.windowStart <= today} onClick={() => p.setWindowStart(maxIso(today, addDaysIso(p.windowStart, -14)))} className="flex size-9 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40" aria-label={t("previousWeeks")}>
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => p.setWindowStart(addDaysIso(p.windowStart, 14))} className="flex size-9 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-surface-2" aria-label={t("nextWeeks")}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-7 sm:px-0" role="listbox" aria-label={t("chooseDate")}>
        {dates.map((d) => {
          const day = p.days.find((x) => x.date === d);
          const count = day?.slots.length ?? 0;
          const selected = p.date === d;
          return (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => p.setDate(d)}
              className={cn(
                "flex h-[72px] w-[58px] shrink-0 flex-col items-center justify-center rounded-lg border transition-colors sm:w-auto",
                selected ? "border-ink bg-ink text-bg" : count ? "border-line bg-surface text-ink hover:border-line-strong" : "border-transparent bg-transparent text-ink-3",
              )}
            >
              <span className={cn("text-[11px] font-medium uppercase tracking-wide", selected ? "text-bg/70" : "text-ink-3")}>{d === today ? t("today") : fmtDay(d, intl, { weekday: "short" })}</span>
              <span className="mt-0.5 text-lg font-semibold tabular">{fmtDay(d, intl, { day: "numeric" })}</span>
              <span className={cn("mt-1 size-1 rounded-full", p.loading ? "bg-transparent" : count ? (selected ? "bg-bg" : "bg-accent") : "bg-transparent")} aria-hidden />
              <span className="sr-only">{p.loading ? "" : count ? t("timesAvailable", { count }) : t("noAvailability")}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8" aria-live="polite">
        {p.error ? (
          <FormError message={p.error.message} />
        ) : p.loading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : p.slots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
            <p className="font-medium text-ink">{p.date ? t("noOpeningsOn", { date: fmtDay(p.date, intl, { weekday: "long", month: "short", day: "numeric" }) }) : t("noOpeningsThisDay")}</p>
            <p className="mt-1 text-sm text-ink-3">{nextOpeningHint(t, intl, p.days, p.date)}</p>
            {p.date && (
              <Button variant="secondary" className="mt-5" onClick={() => setWaitOpen(true)}>
                {t("joinWaitlist")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-7">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="mb-2.5 text-[13px] font-medium text-ink-3">{t(g.key)}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t(`${g.key}Times`)}>
                  {g.slots.map((s) => {
                    const on = p.start === s.start;
                    return (
                      <button
                        key={s.start}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => p.setStart(s.start)}
                        className={cn(
                          "flex h-11 flex-col items-center justify-center rounded-md border text-sm font-semibold tabular transition-[background-color,border-color,color]",
                          on ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink hover:border-ink",
                        )}
                      >
                        {fmtTime(s.start, p.tz, intl)}
                        {p.isGroup && s.spotsLeft != null && <span className={cn("text-[10px] font-medium", on ? "text-bg/70" : "text-ink-3")}>{t("spotsLeft", { count: s.spotsLeft })}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 text-[12px] text-ink-3">
          {differentTz && p.start
            ? t("timesInLocal", { abbr: tzAbbr(new Date(), p.tz, intl), zone: p.tz.replace(/_/g, " "), time: fmtTime(p.start, browserTz, intl) })
            : t("timesIn", { abbr: tzAbbr(new Date(), p.tz, intl), zone: p.tz.replace(/_/g, " ") })}
        </p>
      </div>
      {p.date && <WaitlistDialog open={waitOpen} onOpenChange={setWaitOpen} serviceId={p.serviceId} memberId={p.memberId === "any" ? null : p.memberId} date={p.date} businessSlug={p.businessSlug} />}
    </div>
  );
}

function hourIn(iso: string, tz: string) {
  // Only used for grouping (never shown): read the hour part in Latin digits, whatever the language.
  const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", hourCycle: "h23", numberingSystem: "latn", timeZone: tz }).formatToParts(new Date(iso));
  return Number(parts.find((x) => x.type === "hour")?.value ?? 0) % 24;
}
function maxIso(a: string, b: string) {
  return a > b ? a : b;
}
function nextOpeningHint(t: TFunction, intl: string, days: { date: string; slots: Slot[] }[], date: string | null) {
  const next = days.find((d) => (!date || d.date > date) && d.slots.length);
  if (!next) return t("tryLater");
  return t("nextOpening", { date: fmtDay(next.date, intl, { weekday: "long", month: "short", day: "numeric" }) });
}

function WaitlistDialog({ open, onOpenChange, serviceId, memberId, date, businessSlug }: { open: boolean; onOpenChange: (o: boolean) => void; serviceId: string; memberId: string | null; date: string; businessSlug: string }) {
  const router = useRouter();
  const t = useT("booking.waitlist");
  const { intl } = useLocale();
  const [window_, setWindow] = useState("any");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const windows: Record<string, [number, number]> = { any: [0, 1440], morning: [0, 720], afternoon: [720, 1020], evening: [1020, 1440] };
  async function join() {
    setSaving(true);
    setError(null);
    try {
      const [earliestMinute, latestMinute] = windows[window_];
      await api("/api/waitlist", { body: { serviceId, memberId, date, earliestMinute, latestMinute } });
      toast.success(t("joined"), { description: t("joinedBody") });
      onOpenChange(false);
    } catch (err) {
      const e = err as ApiError;
      if (e.code === "unauthenticated") router.push(`/login?next=${encodeURIComponent(`/${businessSlug}/book?service=${serviceId}&date=${date}`)}`);
      else setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description", { date: fmtDay(date, intl, { weekday: "long", month: "long", day: "numeric" }) })}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={join} loading={saving}>
            {t("notify")}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label={t("windowLabel")}>
        {(fp) => (
          <Select {...fp} value={window_} onChange={(e) => setWindow(e.target.value)}>
            <option value="any">{t("any")}</option>
            <option value="morning">{t("morning")}</option>
            <option value="afternoon">{t("afternoon")}</option>
            <option value="evening">{t("evening")}</option>
          </Select>
        )}
      </Field>
    </Dialog>
  );
}

function PriceBreakdown({ quoteQuery, currency, t, intl }: { quoteQuery: { data?: QuoteResponse; isLoading: boolean; error: unknown }; currency: string; t: TFunction; intl: string }) {
  const money = (cents: number) => formatMoney(cents, currency, { intl });
  if (quoteQuery.isLoading)
    return (
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  if (quoteQuery.error) return <FormError message={(quoteQuery.error as Error).message} />;
  const q = quoteQuery.data?.quote;
  if (!q) return null;
  return (
    <section aria-label={t("price.label")}>
      <dl className="space-y-2 text-[15px]">
        {q.lines.map((l, i) => (
          <div key={i} className={cn("flex justify-between gap-4", l.kind === "discount" ? "text-accent-text" : l.kind === "service" ? "text-ink" : "text-ink-2")}>
            <dt>{lineLabel(t, l)}</dt>
            <dd className="tabular">{l.amountCents < 0 ? `−${money(-l.amountCents)}` : money(l.amountCents)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-line pt-3 text-[17px] font-semibold text-ink">
          <dt>{q.isEstimate ? t("price.estimatedTotal") : t("price.total")}</dt>
          <dd className="tabular">{money(q.totalCents)}</dd>
        </div>
        {q.dueNowCents > 0 ? (
          <>
            <div className="flex justify-between gap-4 text-sm font-medium text-ink">
              <dt>{q.paymentPolicy === "full" ? t("price.payNow") : t("price.depositNow")}</dt>
              <dd className="tabular">{money(q.dueNowCents)}</dd>
            </div>
            {q.dueLaterCents > 0 && (
              <div className="flex justify-between gap-4 text-sm text-ink-3">
                <dt>{t("price.remaining")}</dt>
                <dd className="tabular">{money(q.dueLaterCents)}</dd>
              </div>
            )}
          </>
        ) : (
          q.totalCents > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-ink-3">
              <Check className="size-4 text-accent" /> {t("price.nothingNow")}
            </p>
          )
        )}
        {q.isEstimate && <p className="text-[13px] text-ink-3">{t("price.estimateNote")}</p>}
      </dl>
    </section>
  );
}

/** Lines come priced from the server; the generic ones it words in English are re-worded here. */
function lineLabel(t: TFunction, l: Quote["lines"][number]) {
  if (l.kind === "fee") return t("price.serviceFee");
  if (l.kind === "tax" && l.label === "Tax") return t("price.tax");
  return l.label;
}
