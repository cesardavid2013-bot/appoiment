import { ArrowRight, BadgeCheck, Clock, Globe, Languages, MapPin, Navigation, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { after } from "next/server";
import { AskQuestionButton, FavoriteButton, ShareButton } from "@/components/profile/profile-actions";
import { LazyLocationMap } from "@/components/profile/lazy-map";
import { PortfolioGrid } from "@/components/profile/portfolio-grid";
import { SocialIcon } from "@/components/profile/social-icons";
import { SocialShowcase } from "@/components/profile/social-showcase";
import { initials } from "@/components/business/monogram";
import { Avatar, MediaImage } from "@/components/ui/media";
import { Badge, Stars } from "@/components/ui/misc";
import { formatDuration, formatMoney, formatPriceLabel } from "@/domain/money";
import { describeCancellationPolicy } from "@/domain/policies";
import { socialList } from "@/domain/social";
import { instantToLocal, todayIn, WEEKDAYS } from "@/domain/time";
import { categoryName, priceWords } from "@/i18n/helpers";
import { getI18n, getT } from "@/i18n/server";
import type { TFunction } from "@/i18n/translate";
import { fmtTime, localDateKey, relativeDayWord } from "@/lib/format";
import { cn } from "@/lib/cn";
import { getViewer } from "@/server/auth/session";
import { env } from "@/server/env";
import { getSlots } from "@/server/services/availability";
import { getPublicBusiness, listReviews, ratingBreakdown, type PublicBusiness } from "@/server/services/catalog";
import { isFavorite, recordView } from "@/server/services/engagement";
import { listSocialEmbeds } from "@/server/services/social-embeds";
import { recordClick } from "@/server/services/spotlight";
import { requestNow } from "@/server/clock";

type Props = PageProps<"/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [b, tr] = await Promise.all([getPublicBusiness(slug), getT()]);
  const t = (k: string, v?: Record<string, string | number>) => tr(`profile.meta.${k}`, v);
  if (!b) return { title: t("notFound"), robots: { index: false } };
  const city = b.locations.find((l) => l.city)?.city;
  const base = b.category ? t("titleCategory", { name: b.name, category: categoryName(tr, b.category.slug, b.category.name) }) : b.name;
  const title = city ? t("titleCity", { title: base, city }) : base;
  const description = b.tagline ?? b.about?.slice(0, 160) ?? t("bookOnline", { name: b.name });
  const image = b.cover?.sources.at(-1)?.url ?? b.logo?.sources.at(-1)?.url;
  return {
    title,
    description,
    alternates: { canonical: `/${b.slug}` },
    openGraph: { title, description, url: `/${b.slug}`, type: "website", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

type Fmt = { intl: string; t: TFunction };

/** "10 AM" / "10:30 AM" in 12-hour languages, "10:00" / "10:30" in 24-hour ones. */
function fmtClock(m: number, intl: string) {
  const at = new Date(Date.UTC(2024, 0, 1, 0, m % 1440));
  const twelve = new Intl.DateTimeFormat(intl, { hour: "numeric" }).resolvedOptions().hour12;
  return new Intl.DateTimeFormat(intl, { hour: "numeric", minute: twelve && at.getUTCMinutes() === 0 ? undefined : "2-digit", timeZone: "UTC" }).format(at);
}
function hoursLabel(w: { start: number; end: number }[], { intl, t }: Fmt) {
  if (!w.length) return t("status.closed");
  return w.map((x) => `${fmtClock(x.start, intl)} – ${fmtClock(x.end, intl)}`).join(", ");
}
/** Weekday 1 (Monday) … 7 (Sunday) in the viewer's language. */
function weekdayName(wd: number, intl: string) {
  const s = new Intl.DateTimeFormat(intl, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, wd)));
  return s.charAt(0).toLocaleUpperCase(intl) + s.slice(1);
}

function openStatus(b: PublicBusiness, nowMs: number, f: Fmt) {
  const { intl, t } = f;
  const now = instantToLocal(nowMs, b.timezone);
  const today = b.weeklyHours.find((d) => d.weekday === now.weekday)?.windows ?? [];
  const current = today.find((w) => now.minute >= w.start && now.minute < w.end);
  if (current) return { open: true, label: t("status.openUntil", { time: fmtClock(current.end, intl) }) };
  const later = today.find((w) => w.start > now.minute);
  if (later) return { open: false, label: t("status.opensAt", { time: fmtClock(later.start, intl) }) };
  for (let i = 1; i <= 7; i++) {
    const wd = ((now.weekday - 1 + i) % 7) + 1;
    const w = b.weeklyHours.find((d) => d.weekday === wd)?.windows[0];
    if (w) return { open: false, label: i === 1 ? t("status.opensTomorrow", { time: fmtClock(w.start, intl) }) : t("status.opensDay", { day: weekdayName(wd, intl), time: fmtClock(w.start, intl) }) };
  }
  return { open: false, label: t("status.notSet") };
}

function jsonLd(b: PublicBusiness) {
  const loc = b.locations.find((l) => l.kind === "physical");
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: b.name,
    description: b.tagline ?? undefined,
    url: `${env.APP_URL}/${b.slug}`,
    image: b.cover?.sources.at(-1)?.url ? `${env.APP_URL}${b.cover.sources.at(-1)!.url}` : undefined,
    address: loc ? { "@type": "PostalAddress", streetAddress: loc.address?.split(",")[0], addressLocality: loc.city, addressRegion: loc.region } : undefined,
    geo: loc?.lat != null ? { "@type": "GeoCoordinates", latitude: loc.lat, longitude: loc.lng } : undefined,
    aggregateRating: b.ratingCount > 0 && b.ratingAvg ? { "@type": "AggregateRating", ratingValue: b.ratingAvg.toFixed(1), reviewCount: b.ratingCount } : undefined,
    priceRange: b.priceMinCents != null ? `${formatMoney(b.priceMinCents, b.currency, { compact: true })}–${formatMoney(b.priceMaxCents ?? b.priceMinCents, b.currency, { compact: true })}` : undefined,
  };
}

function SectionHead({ id, eyebrow, title, action }: { id: string; eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <p className="eyebrow text-gold-text">{eyebrow}</p>
        <h2 id={id} className="mt-2 font-display text-[34px] leading-none tracking-[-0.01em] text-ink sm:text-[40px]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  const b = await getPublicBusiness(slug, { allowDraftFor: viewer?.id });
  if (!b) notFound();

  const [{ intl }, tr] = await Promise.all([getI18n(), getT()]);
  const t: TFunction = (k, v) => tr(`profile.${k}`, v);
  const f = { intl, t };
  const words = priceWords(tr);
  const money = (cents: number) => formatMoney(cents, b.currency, { compact: true, intl });

  const now = requestNow();
  const topService = b.services[0];
  const [reviews, breakdown, fav, slots, qrSvg, embeds] = await Promise.all([
    listReviews(b.id, { limit: 6 }),
    ratingBreakdown(b.id),
    viewer ? isFavorite(viewer.id, b.id) : Promise.resolve(false),
    topService ? getSlots({ serviceId: topService.id, memberId: "any", fromDate: todayIn(b.timezone), toDate: todayIn(b.timezone, new Date(now + 13 * 86_400_000)), optionIds: [], autoDefaults: true }).catch(() => null) : Promise.resolve(null),
    QRCode.toString(`${env.APP_URL}/${b.slug}`, { type: "svg", margin: 1, color: { dark: "#1a1814", light: "#ffffff" } }),
    listSocialEmbeds(b.id),
  ]);
  const socials = socialList(b.socialLinks);
  if (viewer) after(() => recordView(viewer.id, b.id).catch(() => undefined));
  if (sp.ref === "spotlight") after(() => recordClick(b.id).catch(() => undefined));

  const nextDay = slots?.days.find((d) => d.slots.length);
  const nextSlots: { start: string }[] = [];
  for (const s of nextDay?.slots ?? []) {
    const last = nextSlots.at(-1);
    if (!last || new Date(s.start).getTime() - new Date(last.start).getTime() >= 30 * 60_000) nextSlots.push(s);
    if (nextSlots.length === 6) break;
  }
  const status = openStatus(b, now, f);
  const policies = describeCancellationPolicy(b.policy, tr);
  const primary = b.locations.find((l) => l.isPrimary) ?? b.locations[0];
  const physical = b.locations.filter((l) => l.kind === "physical");
  const mobile = b.locations.find((l) => l.kind === "mobile");
  const virtual = b.locations.some((l) => l.kind === "virtual");
  const sections = [...new Set(b.services.map((s) => s.menuSection ?? ""))];
  const portfolio = b.portfolio.map((p) => ({ ...p, media: p.media!, serviceName: b.services.find((s) => s.id === p.serviceId)?.name ?? null }));
  const todayWeekday = instantToLocal(now, b.timezone).weekday;
  const isOwnerPreview = b.status !== "active";
  const shareUrl = `${env.APP_URL}/${b.slug}`;
  const category = b.category ? categoryName(tr, b.category.slug, b.category.name) : null;
  const isToday = nextDay?.date === todayIn(b.timezone);
  const isTomorrow = nextDay?.date === localDateKey(new Date(now + 86_400_000), b.timezone);
  const dayLabel = nextDay ? (relativeDayWord(`${nextDay.date}T12:00:00Z`, "UTC", intl, new Date(`${todayIn(b.timezone)}T12:00:00Z`)) ?? new Intl.DateTimeFormat(intl, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(nextDay.date))) : null;
  const nextTitle = !nextDay ? t("panel.none") : isToday ? t("panel.nextToday") : isTomorrow ? t("panel.nextTomorrow") : t("panel.nextOn", { day: dayLabel! });
  const priceFrom = b.priceMinCents != null ? (b.priceMinCents === 0 ? t("panel.freeOptions") : t("panel.from", { price: money(b.priceMinCents) })) : t("panel.onConsultation");
  const place = mobile?.city ? t("travels", { city: mobile.city, km: mobile.serviceRadiusKm ?? 0 }) : primary?.city;

  const nav = [
    { id: "services", label: t("nav.services") },
    ...(portfolio.length ? [{ id: "work", label: t("nav.work") }] : []),
    ...(embeds.length ? [{ id: "featured", label: t("nav.featured") }] : []),
    { id: "reviews", label: b.ratingCount ? `${t("nav.reviews")} (${new Intl.NumberFormat(intl).format(b.ratingCount)})` : t("nav.reviews") },
    { id: "about", label: t("nav.about") },
  ];

  return (
    <div className="pb-28 lg:pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(b)).replace(/</g, "\\u003c") }} />
      {isOwnerPreview && (
        <div className="border-b border-warn/20 bg-warn-soft px-4 py-2.5 text-center text-sm text-warn">
          {t("preview.notice")}{" "}
          <Link href="/pro/onboarding?step=preview" className="font-medium underline underline-offset-2">
            {t("preview.goLive")}
          </Link>
        </div>
      )}

      {/* Masthead */}
      <section className="theme-noir relative isolate overflow-hidden bg-bg text-ink" aria-labelledby="biz-name">
        {b.cover ? (
          <>
            <MediaImage media={b.cover} alt="" priority sizes="100vw" className="absolute inset-0 -z-10 size-full bg-bg opacity-70" />
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,var(--bg)_8%,rgb(14_13_11/0.72)_45%,rgb(14_13_11/0.25))]" aria-hidden />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 [background:radial-gradient(70%_80%_at_85%_0%,rgb(201_168_101/0.13),transparent_65%),radial-gradient(50%_60%_at_0%_100%,rgb(201_168_101/0.06),transparent_70%)]" aria-hidden />
        )}
        <div className="pointer-events-none absolute inset-3 -z-10 hidden border border-gold/20 sm:block" aria-hidden />
        <div className={cn("mx-auto max-w-7xl px-4 pb-10 sm:px-8 lg:px-12", b.cover ? "pt-40 sm:pt-56 lg:pt-72" : "pt-14 sm:pt-20 lg:pt-24")}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="flex items-center gap-3.5">
                {b.logo ? (
                  <Avatar name={b.name} media={b.logo} size={52} className="ring-1 ring-gold/40" />
                ) : (
                  <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full border border-gold/40 font-display text-xl tracking-[0.04em] text-gold-text" aria-hidden>
                    {initials(b.name)}
                  </span>
                )}
                <p className="eyebrow min-w-0 truncate !text-gold-text">{[category, primary?.city].filter(Boolean).join(" · ") || "Kept"}</p>
              </div>
              <h1 id="biz-name" className="mt-6 font-display text-[44px] leading-[0.98] tracking-[-0.02em] text-balance text-ink sm:text-6xl lg:text-[76px]">
                {b.name}
                {b.verified && (
                  <span title={t("verified")} className="ms-3 inline-flex translate-y-[-0.1em] align-middle">
                    <BadgeCheck className="size-7 text-gold sm:size-8" aria-label={t("verifiedLabel")} />
                  </span>
                )}
              </h1>
              {b.tagline && <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2 text-pretty sm:text-lg">{b.tagline}</p>}
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-sm text-ink-2">
                {b.ratingCount > 0 && b.ratingAvg ? (
                  <a href="#reviews" className="inline-flex items-center gap-2 hover:text-ink">
                    <Stars value={b.ratingAvg} size={13} className="text-gold" />
                    <span className="font-semibold text-ink tabular">{b.ratingAvg.toLocaleString(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                    <span className="text-ink-3">{t("reviewsCount", { count: b.ratingCount })}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-ink-3">
                    <Sparkles className="size-4 text-gold" /> {t("newOnKept")}
                  </span>
                )}
                {place && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 text-ink-3" />
                    {place}
                  </span>
                )}
                <span className={cn("inline-flex items-center gap-1.5", status.open ? "text-ink" : "text-ink-3")}>
                  <span className={cn("size-1.5 rounded-full", status.open ? "bg-[#7fc8a0]" : "bg-ink-3")} aria-hidden />
                  {status.label}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AskQuestionButton businessId={b.id} businessName={b.name} signedIn={Boolean(viewer)} className="bg-transparent" />
              <ShareButton url={shareUrl} title={b.name} qrSvg={qrSvg} className="bg-transparent" />
              <FavoriteButton businessId={b.id} initial={fav} signedIn={Boolean(viewer)} variant="plain" />
            </div>
          </div>
        </div>
      </section>

      {/* Section nav */}
      <nav aria-label={t("nav.label")} className="sticky top-16 z-20 border-b border-line bg-bg/92 backdrop-blur-md">
        <ul className="mx-auto flex max-w-7xl gap-7 overflow-x-auto px-4 scrollbar-none sm:px-8 lg:px-12">
          {nav.map((n) => (
            <li key={n.id} className="shrink-0">
              <a href={`#${n.id}`} className="block border-b border-transparent py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3 transition-colors hover:border-ink hover:text-ink">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12">
        <div className="mt-12 grid gap-14 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
          <div className="min-w-0 space-y-20">
            {/* Services — set like a menu */}
            <section id="services" aria-labelledby="services-h" className="scroll-mt-32">
              <SectionHead id="services-h" eyebrow={t("services.eyebrow")} title={t("services.title")} />
              {b.services.length === 0 ? (
                <p className="text-sm text-ink-3">{t("services.empty")}</p>
              ) : (
                <div className="space-y-12">
                  {sections.map((section) => (
                    <div key={section || "default"}>
                      {section && sections.length > 1 && <h3 className="mb-2 font-display text-[22px] italic text-ink-2">{section}</h3>}
                      <ul className="divide-y divide-line">
                        {b.services
                          .filter((s) => (s.menuSection ?? "") === section)
                          .map((s) => {
                            const onSale = s.salePriceCents != null && s.salePriceCents < s.priceCents;
                            const details = [formatDuration(s.durationMinutes, intl), s.hasOptions && t("services.options"), s.paymentPolicy === "deposit" && b.paymentsEnabled && t("services.deposit")].filter(Boolean).join(" · ");
                            return (
                              <li key={s.id} id={`service-${s.slug}`} className="scroll-mt-32 py-6 first:pt-1">
                                <div className="flex items-baseline gap-3">
                                  <h4 className="min-w-0 font-display text-[23px] leading-tight text-ink">{s.name}</h4>
                                  <span className="leader" aria-hidden />
                                  <span className="shrink-0 text-[16px] font-medium text-ink tabular">
                                    {onSale && <span className="me-2 text-sm font-normal text-ink-3 line-through">{money(s.priceCents)}</span>}
                                    {formatPriceLabel(s, b.currency, { intl, words })}
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
                                  <div className="min-w-0">
                                    {s.description && <p className="max-w-xl text-[15px] leading-relaxed text-ink-3 text-pretty">{s.description}</p>}
                                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-3">
                                      <span>{details}</span>
                                      {onSale && <Badge tone="accent">{t("services.sale")}</Badge>}
                                      {s.capacity > 1 && (
                                        <Badge>
                                          <Users className="size-3" /> {t("services.group", { count: s.capacity })}
                                        </Badge>
                                      )}
                                      {s.requiresApproval && <Badge tone="info">{t("services.request")}</Badge>}
                                    </p>
                                  </div>
                                  <Link
                                    href={`/${b.slug}/book?service=${s.id}`}
                                    aria-label={t("services.bookService", { name: s.name })}
                                    className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-full border border-ink px-5 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-bg sm:self-auto"
                                  >
                                    {t("services.book")}
                                    <ArrowRight className="size-3.5" aria-hidden />
                                  </Link>
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {portfolio.length > 0 && (
              <section id="work" aria-labelledby="work-h" className="scroll-mt-32">
                <SectionHead id="work-h" eyebrow={t("work.eyebrow")} title={t("work.title")} />
                <PortfolioGrid items={portfolio} slug={b.slug} />
              </section>
            )}

            {embeds.length > 0 && (
              <section id="featured" aria-labelledby="featured-h" className="scroll-mt-32">
                <SectionHead
                  id="featured-h"
                  eyebrow={t("featured.eyebrow")}
                  title={t("featured.title")}
                  action={
                    socials.length > 0 ? (
                      <a href="#online" className="shrink-0 text-[13px] text-ink-3 hover:text-ink hover:underline">
                        {t("featured.allProfiles")}
                      </a>
                    ) : undefined
                  }
                />
                <SocialShowcase items={embeds} slug={b.slug} />
              </section>
            )}

            {b.team.length > 1 && (
              <section aria-labelledby="team-h">
                <SectionHead id="team-h" eyebrow={t("team.eyebrow")} title={t("team.title")} />
                <ul className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3">
                  {b.team.map((m) => (
                    <li key={m.id} className="flex items-center gap-3.5">
                      <Avatar name={m.name} media={m.avatar} size={56} />
                      <div className="min-w-0">
                        <p className="truncate font-display text-[19px] leading-tight text-ink">{m.name}</p>
                        {m.title && <p className="mt-0.5 truncate text-[13px] text-ink-3">{m.title}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Reviews */}
            <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-32">
              <SectionHead id="reviews-h" eyebrow={t("reviews.eyebrow")} title={t("reviews.title")} />
              {b.ratingCount === 0 || !b.ratingAvg ? (
                <p className="border border-dashed border-line-strong px-5 py-10 text-center text-sm text-ink-3">{t("reviews.empty")}</p>
              ) : (
                <div className="grid gap-10 md:grid-cols-[220px_1fr] md:gap-12">
                  <div>
                    <div className="font-display text-[72px] leading-none text-ink tabular">{b.ratingAvg.toLocaleString(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
                    <Stars value={b.ratingAvg} size={15} className="mt-3 text-gold" />
                    <p className="mt-2 text-sm text-ink-3">{t("reviewsCount", { count: b.ratingCount })}</p>
                    <ul className="mt-6 space-y-1.5" aria-label={t("reviews.distribution")}>
                      {breakdown.map((r) => (
                        <li key={r.rating} className="flex items-center gap-2.5 text-[13px] text-ink-3">
                          <span className="w-3 tabular">{r.rating}</span>
                          <span className="h-px flex-1 bg-line-strong">
                            <span className="block h-px bg-ink" style={{ width: `${b.ratingCount ? (r.count / b.ratingCount) * 100 : 0}%` }} />
                          </span>
                          <span className="w-5 text-end tabular">{r.count}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-6 flex items-start gap-2 text-[12px] leading-snug text-ink-3">
                      <ShieldCheck className="mt-px size-4 shrink-0" />
                      {t("reviews.onlyCustomers")}
                    </p>
                  </div>
                  <ul className="divide-y divide-line">
                    {reviews.map((r) => (
                      <li key={r.id} className="py-7 first:pt-0">
                        <Stars value={r.rating} size={12} className="text-gold" />
                        {r.body && <blockquote className="mt-3 font-display text-[22px] leading-snug text-ink text-pretty">“{r.body}”</blockquote>}
                        <div className="mt-4 flex items-center gap-2.5">
                          <Avatar name={r.authorName} size={28} />
                          <p className="text-[13px] text-ink-3">
                            <span className="font-medium text-ink">{r.authorName}</span>
                            {" · "}
                            {r.serviceName ? `${r.serviceName} · ` : ""}
                            {new Intl.DateTimeFormat(intl, { month: "short", year: "numeric" }).format(r.createdAt)}
                          </p>
                        </div>
                        {r.responseBody && (
                          <div className="mt-4 border-s border-gold/50 ps-4">
                            <p className="eyebrow">{t("reviews.response", { name: b.name })}</p>
                            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{r.responseBody}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* About */}
            <section id="about" aria-labelledby="about-h" className="scroll-mt-32">
              <SectionHead id="about-h" eyebrow={t("about.eyebrow")} title={t("about.title")} />
              {b.about && <p className="max-w-2xl whitespace-pre-line font-display text-[21px] leading-[1.5] text-ink-2 text-pretty">{b.about}</p>}
              <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
                <div>
                  <h3 className="eyebrow mb-4">{t("about.hours")}</h3>
                  <ul className="space-y-2 text-sm">
                    {WEEKDAYS.map((d) => {
                      const w = b.weeklyHours.find((x) => x.weekday === d.value)?.windows ?? [];
                      const today = d.value === todayWeekday;
                      return (
                        <li key={d.value} className={cn("flex items-baseline gap-3", today ? "font-semibold text-ink" : "text-ink-2")} aria-current={today ? "date" : undefined}>
                          <span className={cn("shrink-0", !today && "text-ink-3")}>{weekdayName(d.value, intl)}</span>
                          <span className="leader" aria-hidden />
                          <span className={cn("shrink-0 tabular", !w.length && "text-ink-3")}>{hoursLabel(w, f)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-[12px] text-ink-3">{t("about.timesIn", { zone: b.timezone.replace(/_/g, " ") })}</p>
                </div>
                <div className="space-y-8">
                  <div>
                    <h3 className="eyebrow mb-4">{t("about.policies")}</h3>
                    <ul className="space-y-2 text-sm leading-relaxed text-ink-2">
                      {policies.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                      {b.noShowFeePercent > 0 && <li>{t("about.noShow", { percent: b.noShowFeePercent })}</li>}
                      {b.latePolicy && <li>{b.latePolicy}</li>}
                    </ul>
                  </div>
                  {(b.languages.length > 0 || b.yearsExperience) && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
                      {b.languages.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Languages className="size-4 text-ink-3" /> {b.languages.join(", ")}
                        </span>
                      )}
                      {b.yearsExperience ? <span>{t("about.experience", { years: b.yearsExperience })}</span> : null}
                    </div>
                  )}
                  {b.amenities.length > 0 && (
                    <div>
                      <h3 className="eyebrow mb-3">{t("about.amenities")}</h3>
                      <p className="text-sm text-ink-2">{b.amenities.join(" · ")}</p>
                    </div>
                  )}
                  {(b.website || socials.length > 0) && (
                    <div id="online" className="scroll-mt-32">
                      <h3 className="eyebrow mb-2">{t("about.online")}</h3>
                      <ul className="grid grid-cols-1 text-sm min-[420px]:grid-cols-2 sm:grid-cols-1 xl:grid-cols-2">
                        {b.website && /^https?:\/\//i.test(b.website) && (
                          <li className="min-w-0">
                            <a href={b.website} target="_blank" rel="noopener noreferrer nofollow" className="group flex min-h-11 items-center gap-2.5 sm:min-h-9">
                              <Globe className="size-4 shrink-0 text-ink-2" aria-hidden />
                              <span className="truncate font-medium text-ink group-hover:underline">{b.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span>
                            </a>
                          </li>
                        )}
                        {socials.map((s) => (
                          <li key={s.key} className="min-w-0">
                            <a href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="group flex min-h-11 items-center gap-2.5 sm:min-h-9">
                              <SocialIcon name={s.key} className="size-4 shrink-0 text-ink-2" />
                              <span className="min-w-0 truncate">
                                <span className="font-medium text-ink group-hover:underline">{s.label}</span>
                                {s.handle !== s.label && <span className="ms-1.5 text-ink-3">{s.handle}</span>}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {(physical.length > 0 || mobile || virtual) && (
                <div className="mt-12 grid gap-6 md:grid-cols-2">
                  {physical.map((l) => (
                    <div key={l.id} className="overflow-hidden border border-line bg-surface">
                      {l.lat != null && l.lng != null && (
                        <div className="h-52 border-b border-line">
                          <LazyLocationMap lat={l.lat} lng={l.lng} label={l.name} />
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-4 p-5">
                        <div className="min-w-0">
                          <p className="font-display text-[20px] leading-tight text-ink">{l.name}</p>
                          <p className="mt-1 text-sm text-ink-3">{l.address}</p>
                          {l.instructions && <p className="mt-2 text-[13px] text-ink-3">{l.instructions}</p>}
                        </div>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(l.lat != null ? `${l.lat},${l.lng}` : (l.address ?? ""))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-sm font-medium text-ink hover:bg-surface-2"
                        >
                          <Navigation className="size-4" /> {t("about.directions")}
                        </a>
                      </div>
                    </div>
                  ))}
                  {mobile && (
                    <div className="border border-line bg-surface p-5">
                      <p className="font-display text-[20px] leading-tight text-ink">{t("about.comesToYou")}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{t("about.mobileBody", { city: mobile.city ?? "", km: mobile.serviceRadiusKm ?? 0 })}</p>
                    </div>
                  )}
                  {virtual && (
                    <div className="border border-line bg-surface p-5">
                      <p className="font-display text-[20px] leading-tight text-ink">{t("about.onlineSessions")}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{t("about.onlineBody")}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Reservation card */}
          <aside className="hidden lg:block" aria-label={t("panel.label")}>
            <div className="theme-noir sticky top-32 overflow-hidden bg-bg p-6 text-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.5)]">
              <div className="pointer-events-none absolute inset-2 border border-gold/20" aria-hidden />
              <div className="relative">
                <p className="eyebrow !text-gold-text">{t("panel.eyebrow")}</p>
                {topService ? (
                  <>
                    <p className="mt-3 font-display text-[28px] leading-tight text-ink">{nextTitle}</p>
                    <p className="mt-1 text-[13px] text-ink-3">{priceFrom}</p>
                    {nextSlots.length > 0 && (
                      <>
                        <p className="mt-5 text-[12px] text-ink-3">{topService.name}</p>
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          {nextSlots.map((s) => (
                            <Link
                              key={s.start}
                              href={`/${b.slug}/book?service=${topService.id}&start=${encodeURIComponent(s.start)}`}
                              className="flex h-10 items-center justify-center border border-line-strong text-[13px] font-medium text-ink tabular transition-colors hover:border-gold hover:text-gold-text"
                            >
                              {fmtTime(s.start, slots!.timezone, intl)}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                    <Link href={`/${b.slug}/book`} className="mt-5 flex h-12 items-center justify-center gap-2 bg-ink text-[15px] font-medium text-bg transition-colors hover:bg-ink/90">
                      {b.bookingMode === "request" ? t("panel.requestToBook") : t("panel.bookNow")}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                    <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-[13px] leading-snug text-ink-3">
                      <li className="flex items-start gap-2">
                        {b.bookingMode === "instant" ? <Zap className="mt-px size-4 shrink-0 text-gold" /> : <Clock className="mt-px size-4 shrink-0" />}
                        {b.bookingMode === "instant" ? t("panel.instant") : t("panel.confirms")}
                      </li>
                      <li className="flex items-start gap-2">
                        <ShieldCheck className="mt-px size-4 shrink-0" />
                        {policies[0]}
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-3">{t("panel.notTaking")}</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile booking bar */}
      {topService && (
        <div className="theme-noir fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-bg/95 px-4 py-3 text-ink backdrop-blur-md md:bottom-0 lg:hidden">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[12px] text-ink-3">{b.priceMinCents != null && b.priceMinCents > 0 ? t("panel.mobileFrom", { price: money(b.priceMinCents) }) : b.name}</p>
              <p className="truncate text-sm font-medium text-ink">{nextSlots[0] ? t("panel.mobileNext", { day: dayLabel ?? "", time: fmtTime(nextSlots[0].start, slots!.timezone, intl) }) : t("panel.seeAvailability")}</p>
            </div>
            <Link href={`/${b.slug}/book`} className="flex h-11 shrink-0 items-center bg-ink px-6 text-[15px] font-medium text-bg">
              {b.bookingMode === "request" ? t("panel.request") : t("services.book")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
