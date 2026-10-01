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
import { computeQuote, eligibleMembersFor, resolveSelection, type PriceType, type Quote } from "@/domain/pricing";
import type { FormField } from "@/domain/forms";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateLong, fmtTime, localDateKey, tzAbbr } from "@/lib/format";
import { InlineAuth } from "./inline-auth";

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
  policies: string[];
  latePolicy: string | null;
  logo: MediaLike | null;
  services: PublicService[];
  team: { id: string; name: string; title: string | null; avatar: MediaLike | null }[];
  locations: PublicLocation[];
};

type Slot = { start: string; memberIds: string[]; spotsLeft?: number };
type SlotsResponse = { timezone: string; locationId: string | null; days: { date: string; slots: Slot[] }[] };
type QuoteResponse = { quote: Quote; promoError: string | null; requiresApproval: boolean; policies: string[]; latePolicy: string | null; bookingInstructions: string | null };
type StepKey = "service" | "options" | "who" | "time" | "details" | "review";

const STEP_TITLES: Record<StepKey, string> = {
  service: "Choose a service",
  options: "Customize",
  who: "Who & where",
  time: "Pick a time",
  details: "A few details",
  review: "Review & confirm",
};

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
          <button type="button" onClick={back} className="-ml-2 flex size-10 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={stepIndex === 0 ? `Back to ${b.name}` : "Previous step"}>
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink-3">{b.name}</p>
            <p className="truncate text-[15px] font-semibold text-ink">{STEP_TITLES[step]}</p>
          </div>
          <span className="shrink-0 text-[13px] text-ink-3 tabular">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <Link href={`/${b.slug}`} className="ml-1 hidden size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink sm:flex" aria-label="Exit booking">
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
            <ServiceStep services={b.services} currency={b.currency} selectedId={detail?.id ?? null} loading={loadingService} onSelect={chooseService} />
          )}

          {step === "options" && detail && (
            <div className="space-y-9">
              {detail.optionGroups.map((g) => {
                const chosen = optionIds.filter((id) => g.options.some((o) => o.id === id));
                const error = selection && !selection.ok ? selection.errors.find((e) => e.groupId === g.id)?.message : null;
                return (
                  <fieldset key={g.id}>
                    <legend className="mb-1 flex w-full items-baseline justify-between gap-3">
                      <span className="text-[17px] font-semibold text-ink">{g.name}</span>
                      <span className="text-[13px] text-ink-3">{g.required ? "Required" : g.selection === "multiple" ? (g.maxSelect ? `Choose up to ${g.maxSelect}` : "Optional · choose any") : "Optional"}</span>
                    </legend>
                    {g.description && <p className="mb-3 text-sm text-ink-3">{g.description}</p>}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2" role={g.selection === "single" ? "radiogroup" : "group"} aria-label={g.name}>
                      {g.options.map((o) => {
                        const on = chosen.includes(o.id);
                        const atMax = g.selection === "multiple" && g.maxSelect != null && chosen.length >= g.maxSelect && !on;
                        const extras = [o.priceDeltaCents ? `${o.priceDeltaCents > 0 ? "+" : "−"}${formatMoney(Math.abs(o.priceDeltaCents), b.currency, { compact: true })}` : null, o.durationDeltaMinutes ? `${o.durationDeltaMinutes > 0 ? "+" : "−"}${formatDuration(Math.abs(o.durationDeltaMinutes))}` : null].filter(Boolean).join(" · ");
                        return (
                          <ChoiceCard
                            key={o.id}
                            role={g.selection === "single" ? "radio" : "checkbox"}
                            selected={on}
                            disabled={atMax}
                            title={o.name}
                            description={o.description ?? undefined}
                            aside={extras || "Included"}
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
                  <legend className="mb-3 text-[17px] font-semibold text-ink">Where</legend>
                  <div className="grid gap-2">
                    {serviceLocations.map((l) => (
                      <ChoiceCard key={l.id} selected={effectiveLocationId === l.id} onClick={() => { setLocationId(l.id); setStart(null); }} title={l.name} description={l.kind === "physical" ? l.address : l.kind === "mobile" ? `Comes to you · within ${l.serviceRadiusKm} km of ${l.city}` : "Online session"} />
                    ))}
                  </div>
                </fieldset>
              )}
              {eligibleStaff.length > 1 && (
                <fieldset>
                  <legend className="mb-3 text-[17px] font-semibold text-ink">With</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {b.allowAnyStaff && (
                      <ChoiceCard selected={memberId === "any"} onClick={() => { setMemberChoice("any"); setStart(null); }} title="Any available professional" description="Most openings — we'll match you with whoever is free." />
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
                          aside={st?.priceCentsOverride != null ? formatMoney(st.priceCentsOverride, b.currency, { compact: true }) : undefined}
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
                <Field label="Where should we come?" hint={`Within ${effectiveLocation.serviceRadiusKm} km of ${effectiveLocation.city}. Shared only with the business.`} error={fieldErrors.serviceAddress}>
                  {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" placeholder="Street address, apartment, city" />}
                </Field>
              )}
              {detail.intakeFields.map((f) => (
                <IntakeField key={f.id} field={f} value={intake[f.id]} onChange={(v) => setIntake((prev) => ({ ...prev, [f.id]: v }))} error={fieldErrors[`intake.${f.id}`]} />
              ))}
              {detail.consentText && (
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="mb-3 max-h-40 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink-2">{detail.consentText}</p>
                  <Checkbox checked={consent} onCheckedChange={setConsent} label="I have read and agree to the above" />
                  {fieldErrors.consent && <p className="mt-1 text-[13px] text-danger">{fieldErrors.consent}</p>}
                </div>
              )}
              {detail.minAge && <Checkbox checked={ageConfirmed} onCheckedChange={setAgeConfirmed} label={`I confirm I am at least ${detail.minAge} years old`} />}
              <Field label="Anything else they should know?" optional>
                {(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Allergies, preferences, parking notes…" />}
              </Field>
            </div>
          )}

          {step === "review" && detail && start && (
            <div className="space-y-8">
              <section className="rounded-xl border border-line bg-surface">
                <div className="flex items-start gap-4 p-5">
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-2 leading-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: tz }).format(new Date(start))}</span>
                    <span className="mt-0.5 text-lg font-semibold text-ink">{new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: tz }).format(new Date(start))}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-semibold text-ink">{fmtDateLong(start, tz)}</p>
                    <p className="text-[15px] text-ink-2">
                      {fmtTime(start, tz)} – {fmtTime(new Date(new Date(start).getTime() + (estimate?.durationMinutes ?? detail.durationMinutes) * 60_000), tz)} <span className="text-ink-3">{tzAbbr(start, tz)}</span>
                    </p>
                    <button type="button" onClick={() => go("time")} className="mt-1 text-sm font-medium text-ink underline underline-offset-4">
                      Change time
                    </button>
                  </div>
                </div>
                <dl className="divide-y divide-line border-t border-line text-sm">
                  {showStaffInfo && (
                    <div className="flex justify-between gap-4 px-5 py-3">
                      <dt className="text-ink-3">With</dt>
                      <dd className="text-right text-ink">{memberName ?? "Any available professional"}</dd>
                    </div>
                  )}
                  {effectiveLocation && (
                    <div className="flex justify-between gap-4 px-5 py-3">
                      <dt className="text-ink-3">Where</dt>
                      <dd className="text-right text-ink">{effectiveLocation.kind === "physical" ? effectiveLocation.address : effectiveLocation.kind === "mobile" ? address || "Your address" : "Online"}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {!needsDetails && (
                <Field label="Anything they should know?" optional>
                  {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Preferences, questions, accessibility needs…" />}
                </Field>
              )}

              <PriceBreakdown quoteQuery={quoteQuery} currency={b.currency} />

              <div>
                {appliedPromo ? (
                  <div className="flex items-center justify-between rounded-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-2 font-medium text-accent-text">
                      <Tag className="size-4" /> {appliedPromo} {quoteQuery.isFetching ? "…" : "applied"}
                    </span>
                    <button type="button" onClick={() => setPromoCode(null)} className="text-accent-text underline underline-offset-2">
                      Remove
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
                    <Input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Promo code" aria-label="Promo code" className="uppercase" maxLength={40} />
                    <Button type="submit" variant="secondary" disabled={!promoInput.trim()}>
                      Apply
                    </Button>
                  </form>
                )}
                {promoError && <p className="mt-1.5 text-[13px] text-danger">{promoError}</p>}
              </div>

              <section className="rounded-lg bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
                <p className="mb-1.5 font-medium text-ink">Before you book</p>
                <ul className="space-y-1">
                  {(quoteQuery.data?.policies ?? b.policies).map((p) => (
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
                    {confirmLabel(quoteQuery.data, b.bookingMode)}
                  </Button>
                  <p className="text-center text-[12px] text-ink-3">
                    Booking as {viewer.name}
                    {viewer.email ? ` · ${viewer.email}` : ""}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <aside className="hidden lg:block" aria-label="Booking summary">
          <div className="sticky top-24 rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <Avatar name={b.name} media={b.logo} size={40} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">{b.name}</p>
                <p className="flex items-center gap-1 text-[12px] text-ink-3">
                  {b.bookingMode === "instant" ? <Zap className="size-3.5 text-accent" /> : <Clock className="size-3.5" />}
                  {b.bookingMode === "instant" ? "Instant confirmation" : "Confirmed by the business"}
                </p>
              </div>
            </div>
            {detail ? (
              <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-ink">{detail.name}</span>
                  <span className="shrink-0 text-ink tabular">{formatPriceLabel({ ...detail, priceCents: estimate?.lines[0]?.amountCents ?? detail.priceCents, salePriceCents: null }, b.currency)}</span>
                </div>
                {selection?.ok &&
                  selection.selected.map((o) => (
                    <div key={o.id} className="flex justify-between gap-3 text-ink-2">
                      <span>{o.name}</span>
                      <span className="shrink-0 tabular">{o.priceDeltaCents ? `${o.priceDeltaCents > 0 ? "+" : "−"}${formatMoney(Math.abs(o.priceDeltaCents), b.currency, { compact: true })}` : ""}</span>
                    </div>
                  ))}
                <div className="space-y-1.5 pt-1 text-[13px] text-ink-3">
                  {estimate && (
                    <p className="flex items-center gap-2">
                      <Clock className="size-4" /> {formatDuration(estimate.durationMinutes)}
                    </p>
                  )}
                  {start && (
                    <p className="flex items-center gap-2">
                      <CalendarCheck className="size-4" /> {fmtDateLong(start, tz)}, {fmtTime(start, tz)}
                    </p>
                  )}
                  {showStaffInfo && staffPick && (
                    <p className="flex items-center gap-2">
                      <Users className="size-4" /> {memberName ?? "Any available professional"}
                    </p>
                  )}
                  {effectiveLocation && (
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0" /> {effectiveLocation.kind === "physical" ? effectiveLocation.address : effectiveLocation.kind === "mobile" ? "Comes to you" : "Online"}
                    </p>
                  )}
                </div>
                {estimate && (
                  <div className="flex items-baseline justify-between border-t border-line pt-3">
                    <span className="text-ink-2">{step === "review" && quoteQuery.data ? "Total" : "Estimated total"}</span>
                    <span className="text-lg font-semibold text-ink tabular">
                      {formatMoney(step === "review" && quoteQuery.data ? quoteQuery.data.quote.totalCents : estimate.subtotalCents, b.currency)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-5 border-t border-line pt-4 text-sm text-ink-3">Choose a service to see times and prices.</p>
            )}
            {step !== "review" && (
              <Button size="lg" className="mt-5 w-full" disabled={!canContinue} onClick={nextStep}>
                Continue
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
                <p className="text-[12px] text-ink-3">{step === "review" && quoteQuery.data ? "Total" : "Estimated"} · {formatDuration(estimate.durationMinutes)}</p>
                <p className="text-[17px] font-semibold text-ink tabular">{formatMoney(step === "review" && quoteQuery.data ? quoteQuery.data.quote.totalCents : estimate.subtotalCents, b.currency)}</p>
              </>
            ) : (
              <p className="text-sm text-ink-3">{b.name}</p>
            )}
          </div>
          {step === "review" ? (
            viewer ? (
              <Button size="lg" onClick={submit} loading={submitting} className="min-w-40">
                {confirmLabel(quoteQuery.data, b.bookingMode, true)}
              </Button>
            ) : (
              <a href="#auth" className="inline-flex h-12 items-center rounded-lg bg-ink px-5 text-[15px] font-medium text-bg">
                Sign in to book
              </a>
            )
          ) : (
            <Button size="lg" disabled={!canContinue} onClick={nextStep} className="min-w-36">
              Continue
            </Button>
          )}
        </div>
      </div>

      {checkout && (
        <StripeCheckout
          clientSecret={checkout.clientSecret}
          publishableKey={checkout.publishableKey}
          amountLabel={formatMoney(checkout.amount, b.currency)}
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

function confirmLabel(q: QuoteResponse | undefined, mode: "instant" | "request", short = false) {
  if (q?.requiresApproval ?? mode === "request") return short ? "Send request" : "Send booking request";
  if (q && q.quote.dueNowCents > 0) return `${short ? "Pay" : "Confirm and pay"} ${formatMoney(q.quote.dueNowCents, q.quote.currency)}`;
  return short ? "Confirm" : "Confirm booking";
}

function ServiceStep({ services, currency, selectedId, loading, onSelect }: { services: PublicService[]; currency: string; selectedId: string | null; loading: boolean; onSelect: (id: string) => void }) {
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
                  description={[formatDuration(s.durationMinutes), s.hasOptions ? "Options available" : null, s.capacity > 1 ? `Group · up to ${s.capacity}` : null].filter(Boolean).join(" · ")}
                  aside={formatPriceLabel(s, currency)}
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
  const [waitOpen, setWaitOpen] = useState(false);
  const today = todayIn(p.businessTz);
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : p.tz;
  const differentTz = browserTz !== p.tz;
  const groups = [
    { label: "Morning", slots: p.slots.filter((s) => hourIn(s.start, p.tz) < 12) },
    { label: "Afternoon", slots: p.slots.filter((s) => hourIn(s.start, p.tz) >= 12 && hourIn(s.start, p.tz) < 17) },
    { label: "Evening", slots: p.slots.filter((s) => hourIn(s.start, p.tz) >= 17) },
  ].filter((g) => g.slots.length);
  const dates = Array.from({ length: 14 }, (_, i) => addDaysIso(p.windowStart, i));

  return (
    <div>
      {p.preselectMissed && (
        <div className="mb-5 rounded-md border border-warn/25 bg-warn-soft px-3.5 py-3 text-sm text-warn" role="status">
          The time you picked isn’t available with these choices anymore. Here are the closest openings.
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(p.date ?? p.windowStart))}</p>
        <div className="flex gap-1">
          <button type="button" disabled={p.windowStart <= today} onClick={() => p.setWindowStart(maxIso(today, addDaysIso(p.windowStart, -14)))} className="flex size-9 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40" aria-label="Previous two weeks">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => p.setWindowStart(addDaysIso(p.windowStart, 14))} className="flex size-9 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-surface-2" aria-label="Next two weeks">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-7 sm:px-0" role="listbox" aria-label="Choose a date">
        {dates.map((d) => {
          const day = p.days.find((x) => x.date === d);
          const count = day?.slots.length ?? 0;
          const selected = p.date === d;
          const dt = new Date(`${d}T12:00:00Z`);
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
              <span className={cn("text-[11px] font-medium uppercase tracking-wide", selected ? "text-bg/70" : "text-ink-3")}>{d === today ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dt)}</span>
              <span className="mt-0.5 text-lg font-semibold tabular">{dt.getUTCDate()}</span>
              <span className={cn("mt-1 size-1 rounded-full", p.loading ? "bg-transparent" : count ? (selected ? "bg-bg" : "bg-accent") : "bg-transparent")} aria-hidden />
              <span className="sr-only">{p.loading ? "" : count ? `${count} times available` : "No availability"}</span>
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
            <p className="font-medium text-ink">No openings on {p.date ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${p.date}T12:00:00Z`)) : "this day"}</p>
            <p className="mt-1 text-sm text-ink-3">{nextOpeningHint(p.days, p.date)}</p>
            {p.date && (
              <Button variant="secondary" className="mt-5" onClick={() => setWaitOpen(true)}>
                Join the waitlist for this day
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-7">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-2.5 text-[13px] font-medium text-ink-3">{g.label}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={`${g.label} times`}>
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
                        {fmtTime(s.start, p.tz)}
                        {p.isGroup && s.spotsLeft != null && <span className={cn("text-[10px] font-medium", on ? "text-bg/70" : "text-ink-3")}>{s.spotsLeft} left</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 text-[12px] text-ink-3">
          Times in {tzAbbr(new Date(), p.tz)} ({p.tz.replace(/_/g, " ")})
          {differentTz && p.start ? ` — that's ${fmtTime(p.start, browserTz)} where you are.` : "."}
        </p>
      </div>
      {p.date && <WaitlistDialog open={waitOpen} onOpenChange={setWaitOpen} serviceId={p.serviceId} memberId={p.memberId === "any" ? null : p.memberId} date={p.date} businessSlug={p.businessSlug} />}
    </div>
  );
}

function hourIn(iso: string, tz: string) {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date(iso)));
}
function maxIso(a: string, b: string) {
  return a > b ? a : b;
}
function nextOpeningHint(days: { date: string; slots: Slot[] }[], date: string | null) {
  const next = days.find((d) => (!date || d.date > date) && d.slots.length);
  if (!next) return "Try the next two weeks, or join the waitlist and we'll tell you if something opens.";
  return `Next opening: ${new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${next.date}T12:00:00Z`))}.`;
}

function WaitlistDialog({ open, onOpenChange, serviceId, memberId, date, businessSlug }: { open: boolean; onOpenChange: (o: boolean) => void; serviceId: string; memberId: string | null; date: string; businessSlug: string }) {
  const router = useRouter();
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
      toast.success("You're on the waitlist", { description: "We'll notify you right away if a time opens up." });
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
      title="Join the waitlist"
      description={`If a time opens on ${new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}, we'll notify you immediately. Openings go to whoever books first.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={join} loading={saving}>
            Notify me
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label="Times that work for you">
        {(fp) => (
          <Select {...fp} value={window_} onChange={(e) => setWindow(e.target.value)}>
            <option value="any">Any time that day</option>
            <option value="morning">Morning (before noon)</option>
            <option value="afternoon">Afternoon (noon – 5 PM)</option>
            <option value="evening">Evening (after 5 PM)</option>
          </Select>
        )}
      </Field>
    </Dialog>
  );
}

function IntakeField({ field: f, value, onChange, error }: { field: FormField; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  if (f.type === "yes_no")
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          {f.label} {!f.required && <span className="font-normal text-ink-3">(optional)</span>}
        </legend>
        {f.helpText && <p className="-mt-1 mb-2 text-[13px] text-ink-3">{f.helpText}</p>}
        <div className="grid max-w-xs grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <ChoiceCard key={String(v)} selected={value === v} onClick={() => onChange(v)} title={v ? "Yes" : "No"} />
          ))}
        </div>
        {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
      </fieldset>
    );
  if (f.type === "single_choice" || f.type === "multi_choice") {
    const multi = f.type === "multi_choice";
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          {f.label} {!f.required && <span className="font-normal text-ink-3">(optional)</span>}
        </legend>
        {f.helpText && <p className="-mt-1 mb-2 text-[13px] text-ink-3">{f.helpText}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {(f.options ?? []).map((o) => (
            <ChoiceCard
              key={o}
              role={multi ? "checkbox" : "radio"}
              selected={multi ? arr.includes(o) : value === o}
              onClick={() => onChange(multi ? (arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]) : o)}
              title={o}
            />
          ))}
        </div>
        {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
      </fieldset>
    );
  }
  if (f.type === "acknowledgement")
    return (
      <div>
        <Checkbox checked={value === true} onCheckedChange={(v) => onChange(v)} label={f.label} description={f.helpText} />
        {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
      </div>
    );
  return (
    <Field label={f.label} hint={f.helpText} error={error} optional={!f.required}>
      {(p) =>
        f.type === "long_text" ? (
          <Textarea {...p} rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={3000} />
        ) : (
          <Input {...p} type={f.type === "date" ? "date" : "text"} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={300} />
        )
      }
    </Field>
  );
}

function PriceBreakdown({ quoteQuery, currency }: { quoteQuery: { data?: QuoteResponse; isLoading: boolean; error: unknown }; currency: string }) {
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
    <section aria-label="Price breakdown">
      <dl className="space-y-2 text-[15px]">
        {q.lines.map((l, i) => (
          <div key={i} className={cn("flex justify-between gap-4", l.kind === "discount" ? "text-accent-text" : l.kind === "service" ? "text-ink" : "text-ink-2")}>
            <dt>{l.label}</dt>
            <dd className="tabular">{l.amountCents < 0 ? `−${formatMoney(-l.amountCents, currency)}` : formatMoney(l.amountCents, currency)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-line pt-3 text-[17px] font-semibold text-ink">
          <dt>{q.isEstimate ? "Estimated total" : "Total"}</dt>
          <dd className="tabular">{formatMoney(q.totalCents, currency)}</dd>
        </div>
        {q.dueNowCents > 0 ? (
          <>
            <div className="flex justify-between gap-4 text-sm font-medium text-ink">
              <dt>{q.paymentPolicy === "full" ? "Pay now" : "Deposit due now"}</dt>
              <dd className="tabular">{formatMoney(q.dueNowCents, currency)}</dd>
            </div>
            {q.dueLaterCents > 0 && (
              <div className="flex justify-between gap-4 text-sm text-ink-3">
                <dt>Remaining at appointment</dt>
                <dd className="tabular">{formatMoney(q.dueLaterCents, currency)}</dd>
              </div>
            )}
          </>
        ) : (
          q.totalCents > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-ink-3">
              <Check className="size-4 text-accent" /> Nothing to pay now — pay at your appointment.
            </p>
          )
        )}
        {q.isEstimate && <p className="text-[13px] text-ink-3">Final price is confirmed by the business and may vary with the work needed.</p>}
      </dl>
    </section>
  );
}
