import { Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReviewFilters, ReviewList } from "@/components/pro/review-list";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Stars } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { proPage } from "@/server/pro-page";
import { listBusinessReviews, reviewSummary } from "@/server/services/reviews-admin";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: PageProps<"/pro/reviews">) {
  const { viewer, m } = await proPage("reviews.respond");
  const sp = await searchParams;
  const needsReply = sp.view === "needs-reply";
  const rating = typeof sp.rating === "string" && /^[1-5]$/.test(sp.rating) ? Number(sp.rating) : null;
  const beforeRaw = typeof sp.before === "string" ? new Date(sp.before) : null;
  const before = beforeRaw && !Number.isNaN(beforeRaw.getTime()) ? beforeRaw : null;

  const [summary, page] = await Promise.all([reviewSummary(m), listBusinessReviews(m, viewer.id, { needsReply, rating, before })]);
  const filtered = needsReply || rating != null;
  const query = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (needsReply) q.set("view", "needs-reply");
    if (rating) q.set("rating", String(rating));
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `/pro/reviews?${q}`;
  };
  const max = Math.max(1, ...summary.distribution.map((d) => d.count));
  const average = summary.average ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader title="Reviews" description="Only clients who completed a booking with you can leave a review — one per visit. Your replies appear publicly under each one." />

      {summary.count === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-line-strong">
          <EmptyState
            icon={<Star />}
            title="No reviews yet"
            description="After a visit is marked completed, the client gets a request to rate it. Reviews show up here as they come in, and you can reply to each one."
            action={
              <ButtonLink href="/pro/today" variant="secondary">
                Go to today&apos;s schedule
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
          <aside aria-labelledby="summary-h" className="lg:sticky lg:top-8 lg:self-start">
            <h2 id="summary-h" className="sr-only">
              Rating summary
            </h2>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-6 lg:block">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:gap-3">
                <p className="font-display text-[52px] leading-none text-ink tabular">{average.toFixed(1)}</p>
                <div className="pb-1">
                  <Stars value={average} size={15} />
                  <p className="mt-1 text-[13px] text-ink-3">
                    {summary.count} {summary.count === 1 ? "review" : "reviews"}
                  </p>
                </div>
              </div>
              <ul className="space-y-0.5 lg:mt-5" aria-label="Ratings breakdown">
                {summary.distribution.map((d) => (
                  <li key={d.rating}>
                    <Link
                      href={rating === d.rating ? "/pro/reviews" : `/pro/reviews?rating=${d.rating}`}
                      className={cn(
                        "grid grid-cols-[2.25rem_minmax(0,1fr)_2rem] items-center gap-2 rounded-md px-1.5 py-1 text-[13px] lg:py-1.5 hover:bg-surface-2",
                        rating === d.rating && "bg-surface-2",
                      )}
                      aria-label={`${d.rating} stars: ${d.count} ${d.count === 1 ? "review" : "reviews"}${rating === d.rating ? " (showing, select to clear)" : ""}`}
                      aria-current={rating === d.rating ? "true" : undefined}
                    >
                      <span className="text-ink-2 tabular">{d.rating} ★</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        <span className="block h-full rounded-full bg-ink" style={{ width: `${(d.count / max) * 100}%` }} />
                      </span>
                      <span className="text-right text-ink-3 tabular">{d.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-5 border-t border-line pt-4 text-[13px] text-ink-3">
              {summary.needsReply === 0 ? (
                "You've replied to every review."
              ) : (
                <>
                  <span className="font-medium text-ink">{summary.needsReply}</span> {summary.needsReply === 1 ? "review is" : "reviews are"} waiting for a reply.
                </>
              )}
            </p>
          </aside>

          <section aria-label="Reviews" className="min-w-0">
            <ReviewFilters counts={{ all: summary.count, needsReply: summary.needsReply }} />
            {page.reviews.length === 0 ? (
              <EmptyState
                title={needsReply && !rating ? "All caught up" : "No reviews match"}
                description={needsReply && !rating ? "Every review has a reply. New ones will show up here." : "Try a different rating, or show all reviews."}
                action={
                  filtered ? (
                    <ButtonLink href="/pro/reviews" variant="secondary" size="sm">
                      Show all reviews
                    </ButtonLink>
                  ) : undefined
                }
              />
            ) : (
              <>
                <ReviewList items={page.reviews} timezone={m.timezone} businessName={m.businessName} />
                {(page.nextBefore || before) && (
                  <div className="flex items-center justify-between border-t border-line pt-4 text-sm">
                    {before ? (
                      <Link href={query({})} className="font-medium text-ink-2 hover:text-ink">
                        Back to newest
                      </Link>
                    ) : (
                      <span />
                    )}
                    {page.nextBefore && (
                      <Link href={query({ before: page.nextBefore })} className="font-medium text-ink-2 hover:text-ink">
                        Older reviews
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
