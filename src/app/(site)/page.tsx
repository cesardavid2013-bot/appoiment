import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { CardRail } from "@/components/business/card-rail";
import { HeroSearch } from "@/components/search/hero-search";
import { OpeningsBoard } from "@/components/search/openings-board";
import { Avatar } from "@/components/ui/media";
import { Badge } from "@/components/ui/misc";
import { STATUS_LABELS, STATUS_TONE } from "@/domain/appointment-state";
import { fmtDateLong, fmtTime } from "@/lib/format";
import { LOCATION_COOKIE, parseLocationCookie } from "@/lib/location";
import { getViewer } from "@/server/auth/session";
import { categoryCounts, listCategories } from "@/server/services/catalog";
import { bookAgain, listCustomerAppointments, recentlyViewedCards } from "@/server/services/customer";
import { favoriteIds } from "@/server/services/engagement";
import { homeModules } from "@/server/services/search";

export default async function HomePage() {
  const viewer = await getViewer();
  const loc = parseLocationCookie((await cookies()).get(LOCATION_COOKIE)?.value);
  const [cats, counts, modules, favs, upcoming, again, recent] = await Promise.all([
    listCategories(),
    categoryCounts(),
    homeModules(loc ? { lat: loc.lat, lng: loc.lng } : {}),
    viewer ? favoriteIds(viewer.id) : Promise.resolve([]),
    viewer ? listCustomerAppointments(viewer.id, "upcoming", 2) : Promise.resolve([]),
    viewer ? bookAgain(viewer.id, 6) : Promise.resolve([]),
    viewer ? recentlyViewedCards(viewer.id, 8) : Promise.resolve([]),
  ]);
  const favSet = new Set(favs);
  const signedIn = Boolean(viewer);
  const next = upcoming[0];
  const firstName = viewer?.name.split(" ")[0];

  return (
    <div className="pb-8">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-4 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14 lg:px-8 lg:pt-16">
        <div>
          <p className="mb-4 text-sm font-medium text-ink-3">{firstName ? `Good to see you, ${firstName}.` : "Barbers, stylists, trainers, tutors, detailers and more"}</p>
          <h1 className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ink text-balance sm:text-6xl lg:text-[72px]">
            Book the people who make your week better.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-3 text-pretty">Real openings, upfront prices and reviews from verified visits. Pick a time and you’re booked.</p>
          <div className="mt-8">
            <HeroSearch initialLocation={loc} />
          </div>
        </div>
        <OpeningsBoard items={modules.nearby} />
      </section>

      <section aria-labelledby="browse" className="mx-auto mt-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="browse" className="sr-only">Browse by category</h2>
        <ul className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-3 lg:grid-cols-6">
          {cats
            .filter((c) => c.slug !== "other")
            .slice(0, 12)
            .map((c) => {
              const n = counts.get(c.slug) ?? 0;
              return (
                <li key={c.slug} className="border-b border-r border-line">
                  <Link href={`/explore?category=${c.slug}`} className="group flex h-full flex-col justify-between gap-6 p-4 transition-colors hover:bg-surface">
                    <span className="text-[15px] font-medium leading-snug text-ink">{c.name}</span>
                    <span className="flex items-center justify-between text-[12px] text-ink-3">
                      {n > 0 ? `${n} ${n === 1 ? "pro" : "pros"}` : "Coming soon"}
                      <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
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
                  <p className="text-[13px] font-medium text-ink-3">Your next appointment</p>
                  <p className="mt-1.5 text-xl font-semibold tracking-[-0.01em] text-ink">{next.snapshot.serviceName}</p>
                  <p className="mt-0.5 text-[15px] text-ink-2">{next.businessName}</p>
                </div>
                <Badge tone={STATUS_TONE[next.status]}>{STATUS_LABELS[next.status]}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-ink-3" />
                  {fmtDateLong(next.startsAt, next.timezone)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4 text-ink-3" />
                  {fmtTime(next.startsAt, next.timezone)}
                </span>
                {next.snapshot.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 text-ink-3" />
                    {next.snapshot.address.split(",")[0]}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 font-medium text-ink group-hover:underline">
                  Details <ArrowRight className="size-4" />
                </span>
              </div>
            </Link>
          )}
          {again.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
              <p className="text-[13px] font-medium text-ink-3">Book again</p>
              <ul className="mt-3 divide-y divide-line">
                {again.slice(0, 3).map((b) => (
                  <li key={b.businessId} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0">
                    <Avatar name={b.name} media={b.logo} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">{b.name}</p>
                      <p className="truncate text-[13px] text-ink-3">{b.serviceName}</p>
                    </div>
                    <Link href={`/${b.slug}/book?service=${b.serviceId}`} className="h-9 shrink-0 rounded-md bg-ink px-3.5 text-sm font-medium leading-9 text-bg hover:bg-ink/90">
                      Rebook
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <CardRail title={loc ? `Available soon near ${loc.label === "Current location" ? "you" : loc.label}` : "Available soon"} subtitle="Live openings from each professional's calendar." href="/explore" items={modules.availableSoon} favorites={favSet} signedIn={signedIn} />
      <CardRail title="Recently viewed" items={recent} favorites={favSet} signedIn={signedIn} />
      <CardRail title="Highly rated" subtitle="Ratings come only from completed, verified bookings." href="/explore?sort=rating" items={modules.topRated} favorites={favSet} signedIn={signedIn} />
      <CardRail title="New on Kept" href="/explore" items={modules.newcomers} favorites={favSet} signedIn={signedIn} />

      <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 overflow-hidden rounded-xl bg-ink px-6 py-10 text-bg sm:px-10 sm:py-14 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-medium text-bg/60">For professionals</p>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] tracking-[-0.01em] text-balance sm:text-5xl">Your services, your hours, your clients — in one place.</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-bg/70">Online booking, a calendar that prevents double-bookings, reminders that cut no-shows, and a profile that shows off your work. Free to start.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup?intent=pro" className="inline-flex h-11 items-center rounded-md bg-bg px-5 text-[15px] font-medium text-ink hover:bg-bg/90">
                Offer your services
              </Link>
              <Link href="/for-business" className="inline-flex h-11 items-center gap-1.5 rounded-md px-4 text-[15px] font-medium text-bg/80 hover:text-bg">
                How it works <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ["Any kind of service", "Options like length, size or add-ons change price and time automatically."],
              ["Never double-booked", "Every slot is checked by the server at the moment of booking."],
              ["Fewer no-shows", "Automatic reminders, deposits and clear cancellation policies."],
              ["Get discovered", "Show your work, collect verified reviews, and promote your profile."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-lg border border-bg/10 bg-bg/[0.04] p-4">
                <p className="text-[15px] font-medium">{t}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-bg/60">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
