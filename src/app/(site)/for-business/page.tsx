import { ArrowRight, ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookingGridPanel,
  CheckItem,
  ClientCardPanel,
  PolicyPanel,
  PortfolioPanel,
  ReminderCard,
  SpotlightPanel,
  TeamPanel,
  TodayPanel,
} from "@/components/marketing/product-demos";
import { ServiceOptionsDemo } from "@/components/marketing/service-options-demo";
import { buttonClass } from "@/components/ui/button";
import { LAUNCH_PLAN, PLANS, type PlanTier } from "@/domain/plans";
import { cn } from "@/lib/cn";
import { env } from "@/server/env";
import { listCategories } from "@/server/services/catalog";
import { shellViewer } from "@/server/viewer";

export const metadata: Metadata = {
  title: "Kept for professionals — online booking and a calendar that works for you",
  description: "Take bookings online, stop double-bookings and no-shows, and get discovered by local customers. Free to start for independent professionals.",
  alternates: { canonical: "/for-business" },
};

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

function Feature({ title, children, demo, reverse }: { title: string; children: ReactNode; demo: ReactNode; reverse?: boolean }) {
  return (
    <div className="grid items-center gap-8 py-12 sm:py-16 lg:grid-cols-2 lg:gap-16">
      <div className={cn("max-w-lg", reverse && "lg:order-2")}>
        <h3 className="text-2xl font-semibold tracking-[-0.015em] text-ink text-balance sm:text-[28px]">{title}</h3>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-3">{children}</div>
      </div>
      <div className={cn("mx-auto w-full max-w-md", reverse && "lg:order-1")}>{demo}</div>
    </div>
  );
}

export default async function ForBusinessPage() {
  const [viewer, cats] = await Promise.all([shellViewer(), listCategories()]);
  const primary = viewer?.hasBusiness
    ? { href: "/pro", label: "Go to your business" }
    : viewer
      ? { href: "/pro/onboarding", label: "Set up your business" }
      : { href: "/signup?intent=pro", label: "Get started — it's free" };
  const host = new URL(env.APP_URL).host;
  const customerFee = env.PLATFORM_CUSTOMER_FEE_BPS;
  const tiers: PlanTier[] = ["free", "pro", "business"];

  const faqs: { q: string; a: ReactNode }[] = [
    {
      q: "What does Kept cost?",
      a: `There's no monthly fee: while Kept is launching, new businesses get the ${PLANS[LAUNCH_PLAN].label} plan free. When a client pays online — a deposit or the full price — Kept keeps ${pct(PLANS[LAUNCH_PLAN].applicationFeeBps)} of that payment. Appointments paid in person carry no Kept fee at all.`,
    },
    {
      q: "Do my clients pay to book?",
      a:
        customerFee > 0
          ? `Clients see a ${pct(customerFee)} service fee at checkout, shown before they confirm. Nothing is ever added after the fact.`
          : "No. Clients book for free and see your exact price before they confirm.",
    },
    {
      q: "Do I need to take payments online?",
      a: "No. You can let clients pay in person, or require a deposit or full payment when they book. Online payments are processed by Stripe and paid out to your own bank account.",
    },
    {
      q: "Can I approve bookings before they're confirmed?",
      a: "Yes. Choose instant booking, or request mode where every booking waits for your approval. The time is held while you decide, and requests you don't answer expire on their own.",
    },
    {
      q: "I work from home, travel to clients, or teach online. Does that work?",
      a: "Yes. Each location can be a physical address, a mobile service area where clients give you their address, or a virtual session. You can offer any combination.",
    },
    {
      q: "How does Spotlight work?",
      a: "Spotlight shows your profile as a clearly labelled “Promoted” result in search and category pages, at most two per page. It's free during launch — start or stop it any time from your dashboard.",
    },
    {
      q: "Can I use my own link?",
      a: `Yes. Every business gets a profile at ${host}/your-name that you can share on Instagram, in your bio or on a QR code. Clients booking through it don't have to search for you.`,
    },
  ];

  return (
    <div className="overflow-x-clip pb-8">
      {/* Hero */}
      <section className="mx-auto grid max-w-7xl gap-12 px-4 pb-8 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:px-8 lg:pt-20">
        <div>
          <p className="mb-4 text-sm font-medium text-ink-3">Kept for professionals</p>
          <h1 className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ink text-balance sm:text-6xl lg:text-[72px]">Fill your book. Keep your evenings.</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-3 text-pretty">
            Online booking, a calendar that can&apos;t double-book, reminders that cut no-shows, and a profile in front of people near you looking for exactly what you do. Free to start.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={primary.href} className={buttonClass("primary", "lg")}>
              {primary.label}
            </Link>
            <a href="#how" className={cn(buttonClass("ghost", "lg"), "gap-1.5")}>
              How it works <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
          <p className="mt-4 text-[13px] text-ink-3">No card required. Your profile stays private until you publish it.</p>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <TodayPanel />
          <ReminderCard className="relative mt-3 ml-auto w-[88%] sm:-mr-6 lg:-mr-10" />
        </div>
      </section>

      {/* Two sides */}
      <section aria-labelledby="sides-h" className="mx-auto mt-16 max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="sides-h" className="sr-only">
          How Kept works for clients and for you
        </h2>
        <div className="grid border-l border-t border-line sm:grid-cols-2">
          <div className="border-b border-r border-line p-6 sm:p-8">
            <p className="text-[13px] font-medium text-ink-3">For your clients</p>
            <p className="mt-2 font-display text-[30px] leading-tight text-ink">Discover and book great professionals.</p>
            <ul className="mt-5 space-y-2.5">
              <CheckItem>Search by service, place and time, and see real openings — not a contact form.</CheckItem>
              <CheckItem>Upfront prices, your policies and verified reviews before they book.</CheckItem>
              <CheckItem>Reminders, directions, and rescheduling without a phone call.</CheckItem>
            </ul>
          </div>
          <div className="border-b border-r border-line bg-surface p-6 sm:p-8">
            <p className="text-[13px] font-medium text-ink-3">For you</p>
            <p className="mt-2 font-display text-[30px] leading-tight text-ink">Run your appointments and grow your business.</p>
            <ul className="mt-5 space-y-2.5">
              <CheckItem>One calendar for bookings, breaks and time off — on your phone.</CheckItem>
              <CheckItem>Deposits and cancellation rules that are enforced for you.</CheckItem>
              <CheckItem>Client history, notes and reviews that bring people back.</CheckItem>
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="how-h" className="mx-auto mt-24 max-w-7xl scroll-mt-24 px-4 sm:px-6 lg:px-8">
        <h2 id="how-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
          Live in three steps
        </h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {[
            ["Set up your profile", "Add your services with prices and durations, your hours, where you work and a few photos of your work. We walk you through it."],
            ["Share your link", `Put ${host}/your-name in your bio and on your cards. Once you publish, you also appear in search for people nearby.`],
            ["Take bookings", "Clients pick a real opening and book in seconds. You get notified, they get reminders, and your calendar stays correct."],
          ].map(([t, d], i) => (
            <li key={t} className="border-t border-ink pt-5">
              <span className="font-display text-3xl text-ink-3 tabular">0{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold text-ink">{t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Industries */}
      <section aria-labelledby="ind-h" className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 id="ind-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
            Built for any service you book by the hour
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-3">If clients book time with you, Kept fits — whether you work alone from a chair or run a team across several locations.</p>
        </div>
        <ul className="mt-10 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
          {cats
            .filter((c) => c.slug !== "other")
            .map((c) => (
              <li key={c.slug} className="border-b border-r border-line p-5">
                <p className="text-[15px] font-medium text-ink">{c.name}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{c.children.length ? c.children.map((x) => x.name).join(", ") : c.description}</p>
              </li>
            ))}
        </ul>
      </section>

      {/* Features */}
      <section aria-labelledby="feat-h" className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="feat-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
          Everything the day needs
        </h2>
        <div className="mt-4 divide-y divide-line">
          <Feature title="Online booking with real availability" demo={<BookingGridPanel />}>
            <p>Clients only ever see times you can actually do — your hours, minus existing bookings, breaks, buffers and time off, with minimum notice and how far ahead they can book.</p>
            <p>Every booking is checked again at the moment it&apos;s made, so two people can never land in the same slot, even if they tap at the same second.</p>
          </Feature>
          <Feature title="Services that work the way you price" demo={<ServiceOptionsDemo />} reverse>
            <p>Fixed, starting-at, a range, free or by consultation. Add options like length, size or add-ons, and each one adjusts both the price and the time held in your calendar.</p>
            <p>Add buffers before or after, limit services to certain team members or locations, and ask intake questions before the first visit.</p>
          </Feature>
          <Feature title="Deposits and policies, enforced for you" demo={<PolicyPanel />}>
            <p>Ask for a deposit or full payment up front, set a cancellation window and late-cancel or no-show fees. Clients see the rules before they book, and refunds follow them automatically.</p>
          </Feature>
          <Feature title="Reminders that cut no-shows" demo={<ReminderCard />} reverse>
            <p>Confirmations and reminders go out on their own — by default a day before and two hours before — with a link to reschedule inside your rules instead of just not showing up.</p>
            <p>When someone cancels, clients on your waitlist for that day hear about the opening.</p>
          </Feature>
          <Feature title="Know your clients" demo={<ClientCardPanel />}>
            <p>Every client gets a record of visits, spend, cancellations and no-shows, plus private notes only your team can see. Message clients from the same place.</p>
          </Feature>
          <Feature title="From solo chair to team and locations" demo={<TeamPanel />} reverse>
            <p>Add team members with their own hours and services, and roles that control what each person can see and do. Run several locations, each with its own time zone and hours.</p>
          </Feature>
          <Feature title="A portfolio that books" demo={<PortfolioPanel />}>
            <p>Show photos and short videos of your work. Link each one to a service, and clients can tap “Book this” to book exactly what they saw.</p>
          </Feature>
          <Feature title="Spotlight — free during launch" demo={<SpotlightPanel />} reverse>
            <p>Promote your profile in search and category pages near you. Promoted results are always labelled, limited to two per page, and still show your real ratings and openings.</p>
            <p>Spotlight costs nothing while Kept is launching. If that ever changes, we&apos;ll tell you before anything is charged — it never switches to paid on its own.</p>
          </Feature>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" aria-labelledby="price-h" className="mx-auto mt-16 max-w-7xl scroll-mt-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 id="price-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
            Plans
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-3">
            While Kept is launching, every new business starts on {PLANS[LAUNCH_PLAN].label} with no monthly fee. Prices for paid plans will be announced well before they apply, and nobody is charged without choosing a plan.
          </p>
        </div>
        <ul className="mt-10 grid gap-4 lg:grid-cols-3">
          {tiers.map((t) => {
            const p = PLANS[t];
            const available = t === "free" || t === LAUNCH_PLAN;
            const launch = t === LAUNCH_PLAN && t !== "free";
            return (
              <li key={t} className={cn("flex flex-col rounded-xl border p-6", t === LAUNCH_PLAN ? "border-ink bg-surface shadow-[0_0_0_1px_var(--ink)]" : "border-line bg-surface")}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">{p.label}</h3>
                  <span className={cn("rounded-sm px-2 py-0.5 text-xs font-medium", available ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-ink-3")}>{launch ? "Free during launch" : available ? "Available now" : "Not yet available"}</span>
                </div>
                <p className="mt-4 font-display text-4xl text-ink">{available ? "$0" : "—"}</p>
                <p className="text-[13px] text-ink-3">{launch ? "per month while we launch" : available ? "per month" : "Pricing to be announced"}</p>
                <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
                  {[
                    ["Bookable team members", p.maxBookableMembers === 1 ? "1 (just you)" : `Up to ${p.maxBookableMembers}`],
                    ["Locations", p.maxLocations === 1 ? "1" : `Up to ${p.maxLocations}`],
                    ["Fee on online payments", pct(p.applicationFeeBps)],
                    ["Custom team roles", p.customRoles ? "Included" : "—"],
                    ["Advanced analytics", p.advancedAnalytics ? "Included" : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="text-right font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
                  {t === "free"
                    ? "Online booking, calendar, reminders, deposits, client records, intake forms, portfolio and Spotlight are all included."
                    : launch
                      ? "Everything in Solo, plus a team of up to 10, more locations, custom roles and lower fees. What new businesses get today."
                      : "For larger teams and multi-location businesses."}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-[13px] leading-relaxed text-ink-3">
          The fee applies only to payments clients make online through Kept. Appointments paid in person have no Kept fee. Need more people or locations than your plan allows?{" "}
          <Link href="/support/new?category=other" className="font-medium text-ink underline underline-offset-4">
            Tell us
          </Link>
          .
        </p>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-h" className="mx-auto mt-24 grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:px-8">
        <h2 id="faq-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
          Questions
        </h2>
        <div className="divide-y divide-line border-y border-line">
          {faqs.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 pr-6 text-[15px] leading-relaxed text-ink-3">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl bg-ink px-6 py-12 text-bg sm:px-12 sm:py-16">
          <h2 className="max-w-2xl font-display text-4xl leading-[1.05] tracking-[-0.01em] text-balance sm:text-5xl">Your next client is already looking.</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-bg/70">Set up your services and hours, publish your profile, and start taking bookings today.</p>
          <Link href={primary.href} className="mt-8 inline-flex h-12 items-center rounded-md bg-bg px-5 text-[15px] font-medium text-ink hover:bg-bg/90">
            {primary.label}
          </Link>
        </div>
      </section>
    </div>
  );
}
