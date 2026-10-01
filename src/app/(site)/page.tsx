import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Fragment } from "react";
import { CardRail } from "@/components/business/card-rail";
import { HeroSearch } from "@/components/search/hero-search";
import { OpeningsBoard } from "@/components/search/openings-board";
import { Avatar } from "@/components/ui/media";
import { Badge } from "@/components/ui/misc";
import { STATUS_TONE } from "@/domain/appointment-state";
import { categoryDescription, categoryName } from "@/i18n/helpers";
import { getI18n, getT } from "@/i18n/server";
import { fmtDateLong, fmtTime } from "@/lib/format";
import { CURRENT_LOCATION_LABEL, LOCATION_COOKIE, parseLocationCookie } from "@/lib/location";
import { getViewer } from "@/server/auth/session";
import { categoryCounts, listCategories } from "@/server/services/catalog";
import { bookAgain, listCustomerAppointments, recentlyViewedCards } from "@/server/services/customer";
import { favoriteIds } from "@/server/services/engagement";
import { homeModules } from "@/server/services/search";

/** Renders `<em>…</em>` in a message as the gold italic accent, so translations can place the emphasis. */
function emphasized(message: string) {
  return message.split(/<em>(.*?)<\/em>/).map((part, i) =>
    i % 2 ? (
      <em key={i} className="font-normal italic text-gold-text">
        {part}
      </em>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export default async function HomePage() {
  const viewer = await getViewer();
  const loc = parseLocationCookie((await cookies()).get(LOCATION_COOKIE)?.value);
  const [cats, counts, modules, favs, upcoming, again, recent, t, tr, { intl }] = await Promise.all([
    listCategories(),
    categoryCounts(),
    homeModules(loc ? { lat: loc.lat, lng: loc.lng } : {}),
    viewer ? favoriteIds(viewer.id) : Promise.resolve([]),
    viewer ? listCustomerAppointments(viewer.id, "upcoming", 2) : Promise.resolve([]),
    viewer ? bookAgain(viewer.id, 6) : Promise.resolve([]),
    viewer ? recentlyViewedCards(viewer.id, 8) : Promise.resolve([]),
    getT("home"),
    getT(),
    getI18n(),
  ]);
  const favSet = new Set(favs);
  const signedIn = Boolean(viewer);
  const next = upcoming[0];
  const firstName = viewer?.name.split(" ")[0];
  const soonTitle = !loc ? t("rails.availableSoon") : loc.label === CURRENT_LOCATION_LABEL ? t("rails.availableSoonNearYou") : t("rails.availableSoonNear", { place: loc.label });
  const steps = (["find", "choose", "kept"] as const).map((k) => [t(`how.${k}.title`), t(`how.${k}.body`)]);
  const features = (["any", "noDouble", "noShows", "discovered"] as const).map((k) => [t(`pros.features.${k}.title`), t(`pros.features.${k}.body`)]);

  return (
    <div>
      <section className="theme-noir relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.5] [background:radial-gradient(1200px_500px_at_85%_-10%,rgb(201_168_101/0.10),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="reveal">
            <p className="eyebrow !text-gold-text">{firstName ? t("hero.welcomeBack", { name: firstName }) : t("hero.eyebrow")}</p>
            <h1 className="mt-5 font-display text-[52px] leading-[0.98] text-ink text-balance sm:text-[76px] lg:text-[96px]">{emphasized(t("hero.title"))}</h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2 text-pretty">{t("hero.lead")}</p>
            <div className="mt-9">
              <HeroSearch initialLocation={loc} />
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-3">
              {[t("hero.points.verified"), t("hero.points.prices"), t("hero.points.instant")].map((p) => (
                <li key={p} className="inline-flex items-center gap-2">
                  <span className="size-1 rounded-full bg-gold" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="reveal [animation-delay:120ms]">
            <OpeningsBoard items={modules.nearby} />
          </div>
        </div>
      </section>

      <section aria-labelledby="browse" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t("index.eyebrow")}</p>
            <h2 id="browse" className="mt-3 font-display text-4xl leading-none text-ink sm:text-5xl">
              {t("index.title")}
            </h2>
          </div>
          <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:underline">
            {t("index.exploreAll")} <ArrowRight className="size-4" />
          </Link>
        </div>
        <ul className="mt-8 grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {cats
            .filter((c) => c.slug !== "other")
            .slice(0, 12)
            .map((c, i) => {
              const n = counts.get(c.slug) ?? 0;
              const description = categoryDescription(tr, c.slug, c.description);
              return (
                <li key={c.slug} className="border-b border-line sm:odd:border-e lg:border-e lg:[&:nth-child(3n)]:border-e-0 sm:[&:nth-child(2n)]:border-e-0 lg:[&:nth-child(2n)]:border-e">
                  <Link href={`/explore?category=${c.slug}`} className="group flex h-full items-start gap-5 px-1 py-5 transition-colors hover:bg-surface sm:px-5">
                    <span className="w-8 shrink-0 pt-0.5 font-display text-[22px] leading-none text-gold-text tabular">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-display text-[24px] leading-tight text-ink">{categoryName(tr, c.slug, c.name)}</span>
                        {n > 0 && <span className="shrink-0 text-[12px] text-ink-3 tabular">{t("index.pros", { count: n })}</span>}
                      </span>
                      {description && <span className="mt-1 block text-[13px] leading-snug text-ink-3">{description}</span>}
                    </span>
                    <ArrowRight className="mt-1.5 size-4 shrink-0 -translate-x-1 text-ink-3 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                  </Link>
                </li>
              );
            })}
        </ul>
      </section>

      {(next || again.length > 0) && (
        <section className="mx-auto mt-12 grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:px-8">
          {next && (
            <Link href={`/bookings/${next.id}`} className="group flex flex-col justify-between gap-5 rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[13px] font-medium text-ink-3">{t("next.title")}</p>
                  <p className="mt-1.5 text-xl font-semibold tracking-[-0.01em] text-ink">{next.snapshot.serviceName}</p>
                  <p className="mt-0.5 text-[15px] text-ink-2">{next.businessName}</p>
                </div>
                <Badge tone={STATUS_TONE[next.status]}>{tr(`common.appointmentStatus.${next.status}`)}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-ink-3" />
                  {fmtDateLong(next.startsAt, next.timezone, intl)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4 text-ink-3" />
                  {fmtTime(next.startsAt, next.timezone, intl)}
                </span>
                {next.snapshot.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 text-ink-3" />
                    {next.snapshot.address.split(",")[0]}
                  </span>
                )}
                <span className="ms-auto inline-flex items-center gap-1 font-medium text-ink group-hover:underline">
                  {t("next.details")} <ArrowRight className="size-4" />
                </span>
              </div>
            </Link>
          )}
          {again.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
              <p className="text-[13px] font-medium text-ink-3">{t("again.title")}</p>
              <ul className="mt-3 divide-y divide-line">
                {again.slice(0, 3).map((b) => (
                  <li key={b.businessId} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0">
                    <Avatar name={b.name} media={b.logo} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">{b.name}</p>
                      <p className="truncate text-[13px] text-ink-3">{b.serviceName}</p>
                    </div>
                    <Link href={`/${b.slug}/book?service=${b.serviceId}`} className="h-9 shrink-0 rounded-md bg-ink px-3.5 text-sm font-medium leading-9 text-bg hover:bg-ink/90">
                      {t("again.rebook")}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <CardRail id="soon" title={soonTitle} subtitle={t("rails.availableSoonSub")} href="/explore" items={modules.availableSoon} favorites={favSet} signedIn={signedIn} />
      <CardRail id="recent" title={t("rails.recent")} items={recent} favorites={favSet} signedIn={signedIn} />
      <CardRail id="top" title={t("rails.topRated")} subtitle={t("rails.topRatedSub")} href="/explore?sort=rating" items={modules.topRated} favorites={favSet} signedIn={signedIn} />
      <CardRail id="new" title={t("rails.newcomers")} href="/explore" items={modules.newcomers} favorites={favSet} signedIn={signedIn} />

      <section aria-labelledby="how" className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="eyebrow">{t("how.eyebrow")}</p>
        <h2 id="how" className="mt-3 font-display text-4xl leading-none text-ink sm:text-5xl">
          {t("how.title")}
        </h2>
        <ol className="mt-10 grid gap-10 border-t border-line pt-10 md:grid-cols-3 md:gap-12">
          {steps.map(([title, d], i) => (
            <li key={title}>
              <span className="font-display text-[56px] leading-none text-gold-text">{i + 1}</span>
              <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-3">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="theme-noir mt-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8">
          <div>
            <p className="eyebrow !text-gold-text">{t("pros.eyebrow")}</p>
            <h2 className="mt-4 font-display text-[44px] leading-[1.02] text-ink text-balance sm:text-6xl">{emphasized(t("pros.title"))}</h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-2">{t("pros.body")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup?intent=pro" className="inline-flex h-12 items-center rounded-md bg-ink px-6 text-[15px] font-medium text-bg hover:bg-ink/90">
                {t("pros.cta")}
              </Link>
              <Link href="/for-business" className="inline-flex h-12 items-center gap-1.5 rounded-md border border-line-strong px-5 text-[15px] font-medium text-ink hover:bg-surface">
                {t("pros.howItWorks")} <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-line">
            {features.map(([title, d], i) => (
              <div key={title} className={`border-b border-line py-6 ${i % 2 === 0 ? "pe-5" : "border-s ps-5"}`}>
                <dt className="font-display text-[22px] leading-tight text-ink">{title}</dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
