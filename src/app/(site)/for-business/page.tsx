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
import { formatMoney } from "@/domain/money";
import { LAUNCH_PLAN, PLANS, type PlanTier } from "@/domain/plans";
import { categoryDescription, categoryName } from "@/i18n/helpers";
import { rich } from "@/i18n/rich";
import { getI18n, getT } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { env } from "@/server/env";
import { listCategories } from "@/server/services/catalog";
import { shellViewer } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("meta.title"), description: t("meta.description"), alternates: { canonical: "/for-business" } };
}

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

const FEATURES: { key: string; paragraphs: string[]; demo: ReactNode; reverse?: boolean }[] = [
  { key: "booking", paragraphs: ["p1", "p2"], demo: <BookingGridPanel /> },
  { key: "services", paragraphs: ["p1", "p2"], demo: <ServiceOptionsDemo />, reverse: true },
  { key: "policies", paragraphs: ["p1"], demo: <PolicyPanel /> },
  { key: "reminders", paragraphs: ["p1", "p2"], demo: <ReminderCard />, reverse: true },
  { key: "clients", paragraphs: ["p1"], demo: <ClientCardPanel /> },
  { key: "team", paragraphs: ["p1"], demo: <TeamPanel />, reverse: true },
  { key: "portfolio", paragraphs: ["p1"], demo: <PortfolioPanel /> },
  { key: "spotlight", paragraphs: ["p1", "p2"], demo: <SpotlightPanel />, reverse: true },
];

export default async function ForBusinessPage() {
  const [viewer, cats, t, tRoot, { intl }] = await Promise.all([shellViewer(), listCategories(), getT("marketing"), getT(), getI18n()]);
  const pct = (bps: number) => new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
  const primary = viewer?.hasBusiness
    ? { href: "/pro", label: t("cta.dashboard") }
    : viewer
      ? { href: "/pro/onboarding", label: t("cta.setup") }
      : { href: "/signup?intent=pro", label: t("cta.start") };
  const host = new URL(env.APP_URL).host;
  const customerFee = env.PLATFORM_CUSTOMER_FEE_BPS;
  const tiers: PlanTier[] = ["free", "pro", "business"];
  const launchPlan = PLANS[LAUNCH_PLAN].label;

  const faqs: { key: string; a: string }[] = [
    { key: "cost", a: t("faq.cost.a", { plan: launchPlan, fee: pct(PLANS[LAUNCH_PLAN].applicationFeeBps) }) },
    { key: "clientFee", a: customerFee > 0 ? t("faq.clientFee.aFee", { fee: pct(customerFee) }) : t("faq.clientFee.aFree") },
    { key: "payments", a: t("faq.payments.a") },
    { key: "approve", a: t("faq.approve.a") },
    { key: "where", a: t("faq.where.a") },
    { key: "spotlight", a: t("faq.spotlight.a") },
    { key: "link", a: t("faq.link.a", { host }) },
  ];
  const included = (yes: boolean) =>
    yes ? (
      t("plans.included")
    ) : (
      <>
        <span aria-hidden>—</span>
        <span className="sr-only">{t("plans.notIncluded")}</span>
      </>
    );
  const upTo = (n: number) => t("plans.upTo", { n });

  return (
    <div className="overflow-x-clip pb-8">
      {/* Hero */}
      <section className="mx-auto grid max-w-7xl gap-12 px-4 pb-8 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:px-8 lg:pt-20">
        <div>
          <p className="mb-4 text-sm font-medium text-ink-3">{t("hero.eyebrow")}</p>
          <h1 className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ink text-balance sm:text-6xl lg:text-[72px]">{t("hero.title")}</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-3 text-pretty">{t("hero.lede")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={primary.href} className={buttonClass("primary", "lg")}>
              {primary.label}
            </Link>
            <a href="#how" className={cn(buttonClass("ghost", "lg"), "gap-1.5")}>
              {t("hero.howItWorks")} <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </a>
          </div>
          <p className="mt-4 text-[13px] text-ink-3">{t("hero.note")}</p>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <TodayPanel />
          <ReminderCard className="relative mt-3 ms-auto w-[88%] sm:-me-6 lg:-me-10" />
        </div>
      </section>

      {/* Two sides */}
      <section aria-labelledby="sides-h" className="mx-auto mt-16 max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="sides-h" className="sr-only">
          {t("sides.heading")}
        </h2>
        <div className="grid border-s border-t border-line sm:grid-cols-2">
          <div className="border-b border-e border-line p-6 sm:p-8">
            <p className="text-[13px] font-medium text-ink-3">{t("sides.clients.eyebrow")}</p>
            <p className="mt-2 font-display text-[30px] leading-tight text-ink">{t("sides.clients.title")}</p>
            <ul className="mt-5 space-y-2.5">
              {["search", "prices", "reminders"].map((k) => (
                <CheckItem key={k}>{t(`sides.clients.points.${k}`)}</CheckItem>
              ))}
            </ul>
          </div>
          <div className="border-b border-e border-line bg-surface p-6 sm:p-8">
            <p className="text-[13px] font-medium text-ink-3">{t("sides.you.eyebrow")}</p>
            <p className="mt-2 font-display text-[30px] leading-tight text-ink">{t("sides.you.title")}</p>
            <ul className="mt-5 space-y-2.5">
              {["calendar", "deposits", "clients"].map((k) => (
                <CheckItem key={k}>{t(`sides.you.points.${k}`)}</CheckItem>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="how-h" className="mx-auto mt-24 max-w-7xl scroll-mt-24 px-4 sm:px-6 lg:px-8">
        <h2 id="how-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
          {t("steps.heading")}
        </h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {["profile", "share", "book"].map((k, i) => (
            <li key={k} className="border-t border-ink pt-5">
              <span className="font-display text-3xl text-ink-3 tabular">{new Intl.NumberFormat(intl, { minimumIntegerDigits: 2 }).format(i + 1)}</span>
              <h3 className="mt-3 text-lg font-semibold text-ink">{t(`steps.${k}.title`)}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{t(`steps.${k}.body`, { host })}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Industries */}
      <section aria-labelledby="ind-h" className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 id="ind-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
            {t("industries.heading")}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-3">{t("industries.lede")}</p>
        </div>
        <ul className="mt-10 grid border-s border-t border-line sm:grid-cols-2 lg:grid-cols-4">
          {cats
            .filter((c) => c.slug !== "other")
            .map((c) => (
              <li key={c.slug} className="border-b border-e border-line p-5">
                <p className="text-[15px] font-medium text-ink">{categoryName(tRoot, c.slug, c.name)}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                  {c.children.length ? new Intl.ListFormat(intl, { style: "short", type: "unit" }).format(c.children.map((x) => categoryName(tRoot, x.slug, x.name))) : categoryDescription(tRoot, c.slug, c.description)}
                </p>
              </li>
            ))}
        </ul>
      </section>

      {/* Features */}
      <section aria-labelledby="feat-h" className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="feat-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
          {t("features.heading")}
        </h2>
        <div className="mt-4 divide-y divide-line">
          {FEATURES.map((f) => (
            <Feature key={f.key} title={t(`features.${f.key}.title`)} demo={f.demo} reverse={f.reverse}>
              {f.paragraphs.map((p) => (
                <p key={p}>{t(`features.${f.key}.${p}`)}</p>
              ))}
            </Feature>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" aria-labelledby="price-h" className="mx-auto mt-16 max-w-7xl scroll-mt-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 id="price-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
            {t("plans.heading")}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-3">{t("plans.lede", { plan: launchPlan })}</p>
        </div>
        <ul className="mt-10 grid gap-4 lg:grid-cols-3">
          {tiers.map((tier) => {
            const p = PLANS[tier];
            const available = tier === "free" || tier === LAUNCH_PLAN;
            const launch = tier === LAUNCH_PLAN && tier !== "free";
            const state = launch ? "launch" : available ? "available" : "unavailable";
            const rows: [string, ReactNode][] = [
              [t("plans.rows.members"), p.maxBookableMembers === 1 ? t("plans.justYou") : upTo(p.maxBookableMembers)],
              [t("plans.rows.locations"), p.maxLocations === 1 ? new Intl.NumberFormat(intl).format(1) : upTo(p.maxLocations)],
              [t("plans.rows.fee"), pct(p.applicationFeeBps)],
              [t("plans.rows.roles"), included(p.customRoles)],
              [t("plans.rows.analytics"), included(p.advancedAnalytics)],
            ];
            return (
              <li key={tier} className={cn("flex flex-col rounded-xl border p-6", tier === LAUNCH_PLAN ? "border-ink bg-surface shadow-[0_0_0_1px_var(--ink)]" : "border-line bg-surface")}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">{p.label}</h3>
                  <span className={cn("rounded-sm px-2 py-0.5 text-center text-xs font-medium", available ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-ink-3")}>{t(`plans.badge.${state}`)}</span>
                </div>
                <p className="mt-4 font-display text-4xl text-ink">{available ? formatMoney(0, "USD", { compact: true, intl }) : "—"}</p>
                <p className="text-[13px] text-ink-3">{t(`plans.period.${state}`)}</p>
                <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="shrink-0 text-end font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
                  {tier === "free" ? t("plans.summary.free") : launch ? t("plans.summary.launch", { base: PLANS.free.label, members: p.maxBookableMembers }) : t("plans.summary.other")}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-[13px] leading-relaxed text-ink-3">
          {rich(t("plans.footnote"), {
            link: (c) => (
              <Link href="/support/new?category=other" className="font-medium text-ink underline underline-offset-4">
                {c}
              </Link>
            ),
          })}
        </p>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-h" className="mx-auto mt-24 grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:px-8">
        <h2 id="faq-h" className="font-display text-4xl leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
          {t("faq.heading")}
        </h2>
        <div className="divide-y divide-line border-y border-line">
          {faqs.map((f) => (
            <details key={f.key} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {t(`faq.${f.key}.q`)}
                <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 pe-6 text-[15px] leading-relaxed text-ink-3">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl bg-ink px-6 py-12 text-bg sm:px-12 sm:py-16">
          <h2 className="max-w-2xl font-display text-4xl leading-[1.05] tracking-[-0.01em] text-balance sm:text-5xl">{t("closing.title")}</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-bg/70">{t("closing.body")}</p>
          <Link href={primary.href} className="mt-8 inline-flex h-12 items-center rounded-md bg-bg px-5 text-[15px] font-medium text-ink hover:bg-bg/90">
            {primary.label}
          </Link>
        </div>
      </section>
    </div>
  );
}
