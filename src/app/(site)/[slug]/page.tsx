import { BadgeCheck, Clock, Globe, Languages, MapPin, Navigation, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { after } from "next/server";
import { AskQuestionButton, FavoriteButton, ShareButton } from "@/components/profile/profile-actions";
import { LazyLocationMap } from "@/components/profile/lazy-map";
import { PortfolioGrid } from "@/components/profile/portfolio-grid";
import { toneFor, initials } from "@/components/business/monogram";
import { Avatar, MediaImage } from "@/components/ui/media";
import { Badge, Stars } from "@/components/ui/misc";
import { formatDuration, formatMoney, formatPriceLabel } from "@/domain/money";
import { instantToLocal, minutesToClock, todayIn, WEEKDAYS } from "@/domain/time";
import { fmtTime, localDateKey } from "@/lib/format";
import { cn } from "@/lib/cn";
import { getViewer } from "@/server/auth/session";
import { env } from "@/server/env";
import { getSlots } from "@/server/services/availability";
import { getPublicBusiness, listReviews, ratingBreakdown, type PublicBusiness } from "@/server/services/catalog";
import { isFavorite, recordView } from "@/server/services/engagement";
import { recordClick } from "@/server/services/spotlight";
import { requestNow } from "@/server/clock";

type Props = PageProps<"/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const b = await getPublicBusiness(slug);
  if (!b) return { title: "Not found", robots: { index: false } };
  const city = b.locations.find((l) => l.city)?.city;
  const title = `${b.name}${b.category ? ` — ${b.category.name}` : ""}${city ? ` in ${city}` : ""}`;
  const description = b.tagline ?? b.about?.slice(0, 160) ?? `Book ${b.name} online.`;
  const image = b.cover?.sources.at(-1)?.url ?? b.logo?.sources.at(-1)?.url;
  return {
    title,
    description,
    alternates: { canonical: `/${b.slug}` },
    openGraph: { title, description, url: `/${b.slug}`, type: "website", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

function hoursLabel(w: { start: number; end: number }[]) {
  if (!w.length) return "Closed";
  return w.map((x) => `${fmtClock(x.start)} – ${fmtClock(x.end)}`).join(", ");
}
function fmtClock(m: number) {
  const [h, mm] = minutesToClock(m % 1440 === 0 && m > 0 ? 1439 : m).split(":").map(Number);
  const hh = m === 1440 ? 12 : h % 12 || 12;
  const ap = m === 1440 ? "AM" : h < 12 ? "AM" : "PM";
  return mm ? `${hh}:${String(mm).padStart(2, "0")} ${ap}` : `${hh} ${ap}`;
}

function openStatus(b: PublicBusiness, nowMs: number) {
  const now = instantToLocal(nowMs, b.timezone);
  const today = b.weeklyHours.find((d) => d.weekday === now.weekday)?.windows ?? [];
  const current = today.find((w) => now.minute >= w.start && now.minute < w.end);
  if (current) return { open: true, label: `Open · until ${fmtClock(current.end)}` };
  const later = today.find((w) => w.start > now.minute);
  if (later) return { open: false, label: `Opens at ${fmtClock(later.start)}` };
  for (let i = 1; i <= 7; i++) {
    const wd = ((now.weekday - 1 + i) % 7) + 1;
    const w = b.weeklyHours.find((d) => d.weekday === wd)?.windows[0];
    if (w) return { open: false, label: `Opens ${i === 1 ? "tomorrow" : WEEKDAYS[wd - 1].long} at ${fmtClock(w.start)}` };
  }
  return { open: false, label: "Hours not set" };
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

export default async function ProfilePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  const b = await getPublicBusiness(slug, { allowDraftFor: viewer?.id });
  if (!b) notFound();

  const now = requestNow();
  const topService = b.services[0];
  const [reviews, breakdown, fav, slots, qrSvg] = await Promise.all([
    listReviews(b.id, { limit: 6 }),
    ratingBreakdown(b.id),
    viewer ? isFavorite(viewer.id, b.id) : Promise.resolve(false),
    topService ? getSlots({ serviceId: topService.id, memberId: "any", fromDate: todayIn(b.timezone), toDate: todayIn(b.timezone, new Date(now + 13 * 86_400_000)), optionIds: [], autoDefaults: true }).catch(() => null) : Promise.resolve(null),
    QRCode.toString(`${env.APP_URL}/${b.slug}`, { type: "svg", margin: 1, color: { dark: "#1a1814", light: "#ffffff" } }),
  ]);
  if (viewer) after(() => recordView(viewer.id, b.id).catch(() => undefined));
  if (sp.ref === "spotlight") after(() => recordClick(b.id).catch(() => undefined));

  const nextDay = slots?.days.find((d) => d.slots.length);
  const nextSlots: { start: string }[] = [];
  for (const s of nextDay?.slots ?? []) {
    const last = nextSlots.at(-1);
    if (!last || new Date(s.start).getTime() - new Date(last.start).getTime() >= 30 * 60_000) nextSlots.push(s);
    if (nextSlots.length === 6) break;
  }
  const status = openStatus(b, now);
  const primary = b.locations.find((l) => l.isPrimary) ?? b.locations[0];
  const physical = b.locations.filter((l) => l.kind === "physical");
  const mobile = b.locations.find((l) => l.kind === "mobile");
  const virtual = b.locations.some((l) => l.kind === "virtual");
  const sections = [...new Set(b.services.map((s) => s.menuSection ?? ""))];
  const portfolio = b.portfolio.map((p) => ({ ...p, media: p.media!, serviceName: b.services.find((s) => s.id === p.serviceId)?.name ?? null }));
  const todayWeekday = instantToLocal(now, b.timezone).weekday;
  const isOwnerPreview = b.status !== "active";
  const shareUrl = `${env.APP_URL}/${b.slug}`;
  const dayLabel = nextDay ? (nextDay.date === todayIn(b.timezone) ? "Today" : nextDay.date === localDateKey(new Date(now + 86_400_000), b.timezone) ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(nextDay.date))) : null;

  const nav = [
    { id: "services", label: "Services" },
    ...(portfolio.length ? [{ id: "work", label: "Work" }] : []),
    { id: "reviews", label: `Reviews${b.ratingCount ? ` (${b.ratingCount})` : ""}` },
    { id: "about", label: "About" },
  ];

  return (
    <div className="pb-28 lg:pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(b)).replace(/</g, "\\u003c") }} />
      {isOwnerPreview && (
        <div className="border-b border-warn/20 bg-warn-soft px-4 py-2.5 text-center text-sm text-warn">
          Preview — only you can see this page until you publish it.{" "}
          <Link href="/pro/onboarding?step=preview" className="font-medium underline underline-offset-2">
            Go live
          </Link>
        </div>
      )}

      {b.cover && (
        <div className="mx-auto max-w-7xl px-0 sm:px-6 sm:pt-6 lg:px-8">
          <MediaImage media={b.cover} alt={`${b.name}`} priority sizes="(min-width: 1280px) 1280px, 100vw" className="aspect-[21/9] w-full sm:rounded-xl" />
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Identity */}
        <header className={cn("flex flex-col gap-6 pt-8 lg:flex-row lg:items-end lg:justify-between", b.cover && "pt-6")}>
          <div className="flex min-w-0 items-start gap-5">
            {b.logo ? (
              <Avatar name={b.name} media={b.logo} size={84} className="ring-4 ring-bg" />
            ) : (
              <span className={cn("flex size-[84px] shrink-0 items-center justify-center rounded-full font-display text-4xl", toneFor(b.name))} aria-hidden>
                {initials(b.name)}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-x-2 font-display text-[38px] leading-[1.05] tracking-[-0.015em] text-ink sm:text-5xl">
                {b.name}
                {b.verified && (
                  <span title="Verified by Kept" className="inline-flex translate-y-0.5">
                    <BadgeCheck className="size-7 text-accent" aria-label="Verified business" />
                  </span>
                )}
              </h1>
              {b.tagline && <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-ink-2 text-pretty">{b.tagline}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
                {b.ratingCount > 0 && b.ratingAvg ? (
                  <a href="#reviews" className="inline-flex items-center gap-1.5 hover:underline">
                    <Stars value={b.ratingAvg} size={14} />
                    <span className="font-semibold text-ink">{b.ratingAvg.toFixed(1)}</span>
                    <span className="text-ink-3">· {b.ratingCount} verified {b.ratingCount === 1 ? "review" : "reviews"}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-ink-3">
                    <Sparkles className="size-4" /> New on Kept
                  </span>
                )}
                {b.category && <span>{b.category.name}</span>}
                {primary?.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-4 text-ink-3" />
                    {mobile ? `${mobile.city} · travels up to ${mobile.serviceRadiusKm} km` : primary.city}
                  </span>
                )}
                <span className={cn("inline-flex items-center gap-1.5", status.open ? "text-accent-text" : "text-ink-3")}>
                  <Clock className="size-4" />
                  {status.label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AskQuestionButton businessId={b.id} businessName={b.name} signedIn={Boolean(viewer)} />
            <ShareButton url={shareUrl} title={b.name} qrSvg={qrSvg} />
            <FavoriteButton businessId={b.id} initial={fav} signedIn={Boolean(viewer)} variant="plain" />
          </div>
        </header>

        {/* Section nav */}
        <nav aria-label="Profile sections" className="sticky top-16 z-20 -mx-4 mt-8 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:mx-0 sm:px-0">
          <ul className="relative flex gap-6 overflow-x-auto scrollbar-none">
            {nav.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} className="block border-b-2 border-transparent py-3.5 text-sm font-medium text-ink-3 hover:border-line-strong hover:text-ink">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
          <div className="min-w-0 space-y-16">
            {/* Services */}
            <section id="services" aria-labelledby="services-h" className="scroll-mt-32">
              <h2 id="services-h" className="text-xl font-semibold tracking-[-0.015em] text-ink">
                Services
              </h2>
              {b.services.length === 0 ? (
                <p className="mt-4 text-sm text-ink-3">This business hasn’t published services yet.</p>
              ) : (
                sections.map((section) => (
                  <div key={section || "default"} className="mt-6">
                    {section && sections.length > 1 && <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{section}</h3>}
                    <ul className="divide-y divide-line border-y border-line">
                      {b.services
                        .filter((s) => (s.menuSection ?? "") === section)
                        .map((s) => (
                          <li key={s.id} id={`service-${s.slug}`} className="scroll-mt-32">
                            <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:gap-6">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                  <h4 className="text-[16px] font-semibold text-ink">{s.name}</h4>
                                  {s.salePriceCents != null && s.salePriceCents < s.priceCents && <Badge tone="accent">Sale</Badge>}
                                  {s.capacity > 1 && (
                                    <Badge>
                                      <Users className="size-3" /> Group · up to {s.capacity}
                                    </Badge>
                                  )}
                                  {s.requiresApproval && <Badge tone="info">Request to book</Badge>}
                                </div>
                                {s.description && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-3 text-pretty">{s.description}</p>}
                                <p className="mt-2 text-[13px] text-ink-3">
                                  {formatDuration(s.durationMinutes)}
                                  {s.hasOptions && " · Options available"}
                                  {s.paymentPolicy === "deposit" && b.paymentsEnabled && " · Deposit at booking"}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-start">
                                <span className="text-[16px] font-semibold text-ink tabular">
                                  {s.salePriceCents != null && s.salePriceCents < s.priceCents && <span className="mr-2 text-sm font-normal text-ink-3 line-through">{formatMoney(s.priceCents, b.currency, { compact: true })}</span>}
                                  {formatPriceLabel(s, b.currency)}
                                </span>
                                <Link href={`/${b.slug}/book?service=${s.id}`} className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-sm font-medium text-bg transition-colors hover:bg-ink/88">
                                  Book
                                </Link>
                              </div>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))
              )}
            </section>

            {portfolio.length > 0 && (
              <section id="work" aria-labelledby="work-h" className="scroll-mt-32">
                <h2 id="work-h" className="mb-5 text-xl font-semibold tracking-[-0.015em] text-ink">
                  Work
                </h2>
                <PortfolioGrid items={portfolio} slug={b.slug} />
              </section>
            )}

            {b.team.length > 1 && (
              <section aria-labelledby="team-h">
                <h2 id="team-h" className="mb-5 text-xl font-semibold tracking-[-0.015em] text-ink">
                  Team
                </h2>
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {b.team.map((t) => (
                    <li key={t.id} className="flex items-center gap-3">
                      <Avatar name={t.name} media={t.avatar} size={48} />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium text-ink">{t.name}</p>
                        {t.title && <p className="truncate text-[13px] text-ink-3">{t.title}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Reviews */}
            <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-32">
              <h2 id="reviews-h" className="mb-5 text-xl font-semibold tracking-[-0.015em] text-ink">
                Reviews
              </h2>
              {b.ratingCount === 0 || !b.ratingAvg ? (
                <p className="rounded-lg border border-dashed border-line-strong px-5 py-8 text-center text-sm text-ink-3">No reviews yet. Reviews can only be left by customers after a completed visit.</p>
              ) : (
                <div className="grid gap-10 md:grid-cols-[220px_1fr]">
                  <div>
                    <div className="font-display text-6xl leading-none text-ink">{b.ratingAvg.toFixed(1)}</div>
                    <Stars value={b.ratingAvg} size={16} className="mt-2" />
                    <p className="mt-1.5 text-sm text-ink-3">
                      {b.ratingCount} verified {b.ratingCount === 1 ? "review" : "reviews"}
                    </p>
                    <ul className="mt-5 space-y-1.5" aria-label="Rating distribution">
                      {breakdown.map((r) => (
                        <li key={r.rating} className="flex items-center gap-2.5 text-[13px] text-ink-3">
                          <span className="w-3 tabular">{r.rating}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                            <span className="block h-full rounded-full bg-ink" style={{ width: `${b.ratingCount ? (r.count / b.ratingCount) * 100 : 0}%` }} />
                          </span>
                          <span className="w-5 text-right tabular">{r.count}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-5 flex items-start gap-2 text-[12px] leading-snug text-ink-3">
                      <ShieldCheck className="mt-px size-4 shrink-0" />
                      Only customers with a completed booking can leave a review.
                    </p>
                  </div>
                  <ul className="divide-y divide-line">
                    {reviews.map((r) => (
                      <li key={r.id} className="py-5 first:pt-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={r.authorName} size={32} />
                            <div>
                              <p className="text-sm font-medium text-ink">{r.authorName}</p>
                              <p className="text-[12px] text-ink-3">
                                {r.serviceName ? `${r.serviceName} · ` : ""}
                                {new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(r.createdAt)}
                              </p>
                            </div>
                          </div>
                          <Stars value={r.rating} size={13} />
                        </div>
                        {r.body && <p className="mt-3 text-[15px] leading-relaxed text-ink-2 text-pretty">{r.body}</p>}
                        {r.responseBody && (
                          <div className="mt-3 border-l-2 border-line-strong pl-3.5">
                            <p className="text-[12px] font-medium text-ink-3">Response from {b.name}</p>
                            <p className="mt-1 text-sm leading-relaxed text-ink-2">{r.responseBody}</p>
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
              <h2 id="about-h" className="mb-5 text-xl font-semibold tracking-[-0.015em] text-ink">
                About
              </h2>
              {b.about && <p className="max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-ink-2 text-pretty">{b.about}</p>}
              <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                <div>
                  <dt className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">Hours</dt>
                  <dd>
                    <table className="w-full text-sm">
                      <tbody>
                        {WEEKDAYS.map((d) => {
                          const w = b.weeklyHours.find((x) => x.weekday === d.value)?.windows ?? [];
                          const today = d.value === todayWeekday;
                          return (
                            <tr key={d.value} className={cn(today && "font-semibold text-ink")}>
                              <th scope="row" className={cn("py-1 pr-4 text-left font-normal", today ? "font-semibold text-ink" : "text-ink-3")}>
                                {d.long}
                              </th>
                              <td className={cn("py-1 text-right tabular", w.length ? "text-ink-2" : "text-ink-3", today && "text-ink")}>{hoursLabel(w)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[12px] text-ink-3">Times shown in {b.timezone.replace(/_/g, " ")}.</p>
                  </dd>
                </div>
                <div className="space-y-6">
                  <div>
                    <dt className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">Policies</dt>
                    <dd>
                      <ul className="space-y-1.5 text-sm leading-relaxed text-ink-2">
                        {b.policies.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                        {b.noShowFeePercent > 0 && <li>Missed appointments may be charged {b.noShowFeePercent}% of the total.</li>}
                        {b.latePolicy && <li>{b.latePolicy}</li>}
                      </ul>
                    </dd>
                  </div>
                  {(b.languages.length > 0 || b.yearsExperience) && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
                      {b.languages.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Languages className="size-4 text-ink-3" /> {b.languages.join(", ")}
                        </span>
                      )}
                      {b.yearsExperience ? <span>{b.yearsExperience}+ years experience</span> : null}
                    </div>
                  )}
                  {b.amenities.length > 0 && (
                    <div>
                      <dt className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">Amenities</dt>
                      <dd className="text-sm text-ink-2">{b.amenities.join(" · ")}</dd>
                    </div>
                  )}
                  {(b.website || Object.keys(b.socialLinks).length > 0) && (
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      {b.website && (
                        <a href={b.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
                          <Globe className="size-4 text-ink-3" />
                          {b.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      )}
                      {Object.entries(b.socialLinks).map(([k, v]) => (
                        <a key={k} href={socialUrl(k, v)} target="_blank" rel="noopener noreferrer nofollow" className="font-medium capitalize text-ink hover:underline">
                          {k === "x" ? "X" : k}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </dl>

              {(physical.length > 0 || mobile || virtual) && (
                <div className="mt-10 grid gap-6 md:grid-cols-2">
                  {physical.map((l) => (
                    <div key={l.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                      {l.lat != null && l.lng != null && (
                        <div className="h-48 border-b border-line">
                          <LazyLocationMap lat={l.lat} lng={l.lng} label={l.name} />
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium text-ink">{l.name}</p>
                          <p className="mt-0.5 text-sm text-ink-3">{l.address}</p>
                          {l.instructions && <p className="mt-2 text-[13px] text-ink-3">{l.instructions}</p>}
                        </div>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(l.lat != null ? `${l.lat},${l.lng}` : (l.address ?? ""))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink hover:bg-surface-2"
                        >
                          <Navigation className="size-4" /> Directions
                        </a>
                      </div>
                    </div>
                  ))}
                  {mobile && (
                    <div className="rounded-xl border border-line bg-surface p-5">
                      <p className="text-[15px] font-medium text-ink">Comes to you</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-3">
                        Based in {mobile.city}. Travels up to {mobile.serviceRadiusKm} km — you’ll add your address when booking.
                      </p>
                    </div>
                  )}
                  {virtual && (
                    <div className="rounded-xl border border-line bg-surface p-5">
                      <p className="text-[15px] font-medium text-ink">Online sessions</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-3">Join from anywhere. The link is shared after booking.</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Booking panel */}
          <aside className="hidden lg:block" aria-label="Book">
            <div className="sticky top-32 rounded-xl border border-line bg-surface p-5 shadow-sm">
              {topService ? (
                <>
                  <p className="text-[13px] text-ink-3">{b.priceMinCents != null ? (b.priceMinCents === 0 ? "Free options available" : `Services from ${formatMoney(b.priceMinCents, b.currency, { compact: true })}`) : "Prices on consultation"}</p>
                  <p className="mt-0.5 text-lg font-semibold text-ink">{nextDay ? `Next opening ${dayLabel?.toLowerCase().startsWith("to") ? dayLabel?.toLowerCase() : `on ${dayLabel}`}` : "No openings in the next two weeks"}</p>
                  {nextSlots.length > 0 && (
                    <>
                      <p className="mt-3 text-[12px] font-medium text-ink-3">{topService.name}</p>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {nextSlots.map((s) => (
                          <Link
                            key={s.start}
                            href={`/${b.slug}/book?service=${topService.id}&start=${encodeURIComponent(s.start)}`}
                            className="flex h-9 items-center justify-center rounded-md border border-accent/25 bg-accent-soft text-[13px] font-semibold text-accent-text tabular transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
                          >
                            {fmtTime(s.start, slots!.timezone)}
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                  <Link href={`/${b.slug}/book`} className="mt-4 flex h-11 items-center justify-center rounded-md bg-ink text-[15px] font-medium text-bg transition-colors hover:bg-ink/88">
                    {b.bookingMode === "request" ? "Request to book" : "Book now"}
                  </Link>
                  <ul className="mt-4 space-y-2 border-t border-line pt-4 text-[13px] text-ink-3">
                    <li className="flex items-center gap-2">
                      {b.bookingMode === "instant" ? <Zap className="size-4 text-accent" /> : <Clock className="size-4" />}
                      {b.bookingMode === "instant" ? "Instant confirmation" : "The business confirms your request"}
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="size-4" />
                      {b.policies[0]}
                    </li>
                  </ul>
                </>
              ) : (
                <p className="text-sm text-ink-3">This business isn’t taking bookings yet.</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile booking bar */}
      {topService && (
        <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md md:bottom-0 lg:hidden">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-ink-3">{b.priceMinCents != null && b.priceMinCents > 0 ? `From ${formatMoney(b.priceMinCents, b.currency, { compact: true })}` : b.name}</p>
              <p className="truncate text-sm font-semibold text-ink">{nextSlots[0] ? `Next: ${dayLabel} ${fmtTime(nextSlots[0].start, slots!.timezone)}` : "See availability"}</p>
            </div>
            <Link href={`/${b.slug}/book`} className="flex h-11 shrink-0 items-center rounded-md bg-ink px-6 text-[15px] font-medium text-bg">
              {b.bookingMode === "request" ? "Request" : "Book"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function socialUrl(kind: string, handle: string) {
  const h = encodeURIComponent(handle);
  switch (kind) {
    case "instagram":
      return `https://instagram.com/${h}`;
    case "tiktok":
      return `https://tiktok.com/@${h}`;
    case "facebook":
      return `https://facebook.com/${h}`;
    case "youtube":
      return `https://youtube.com/@${h}`;
    case "x":
      return `https://x.com/${h}`;
    case "linkedin":
      return `https://linkedin.com/in/${h}`;
    default:
      return "#";
  }
}
