"use client";

import { Flag, MessageSquareReply, Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Stars } from "@/components/ui/misc";
import { api, type ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";

export type ReviewItem = {
  id: string;
  rating: number;
  body: string | null;
  responseBody: string | null;
  respondedAt: string | null;
  responderName: string | null;
  createdAt: string;
  appointmentStartsAt: string;
  serviceName: string | null;
  memberName: string | null;
  authorName: string;
  reportedByMe: boolean;
};

const MAX = 1500;

/** Filter bar: reply state as links, rating as a select — both live in the URL. */
export function ReviewFilters({ counts }: { counts: { all: number; needsReply: number } }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const view = sp.get("view") === "needs-reply" ? "needs-reply" : "all";
  const rating = sp.get("rating") ?? "";
  const selectId = useId();

  function go(next: { view?: string; rating?: string }) {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    const r = next.rating ?? rating;
    if (v === "needs-reply") q.set("view", v);
    if (r) q.set("rating", r);
    router.push(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
      <nav aria-label="Filter reviews" className="flex gap-6">
        {[
          { v: "all", label: "All", n: counts.all },
          { v: "needs-reply", label: "Needs reply", n: counts.needsReply },
        ].map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => go({ view: t.v })}
            aria-current={view === t.v ? "page" : undefined}
            className={cn(
              "-mb-px flex h-11 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors",
              view === t.v ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {t.label}
            <span className="text-[12px] font-normal text-ink-3 tabular">{t.n}</span>
          </button>
        ))}
      </nav>
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor={selectId} className="text-[13px] text-ink-3">
          Rating
        </label>
        <Select id={selectId} value={rating} onChange={(e) => go({ rating: e.target.value })} className="h-9 w-32 text-sm md:h-9">
          <option value="">Any</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} star{r === 1 ? "" : "s"}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export function ReviewList({ items, timezone, businessName }: { items: ReviewItem[]; timezone: string; businessName: string }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <ReviewRow key={r.id} r={r} timezone={timezone} businessName={businessName} />
      ))}
    </ul>
  );
}

function ReviewRow({ r, timezone, businessName }: { r: ReviewItem; timezone: string; businessName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(r.responseBody ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const day = (iso: string) => fmtDate(iso, timezone, { month: "short", day: "numeric", year: "numeric" });
  const fieldId = useId();

  async function save() {
    const text = draft.trim();
    if (text.length < 2) {
      setError("Write a reply first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/pro/reviews/${r.id}/respond`, { body: { body: text } });
      toast.success(r.responseBody ? "Reply updated" : "Reply posted", { description: "It's visible on your public profile under this review." });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  const meta = [r.serviceName, r.memberName ? `with ${r.memberName}` : null, `visit on ${fmtDate(r.appointmentStartsAt, timezone, { month: "short", day: "numeric" })}`].filter(Boolean).join(" · ");

  return (
    <li className="py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Stars value={r.rating} size={14} />
            <span className="text-[15px] font-medium text-ink">{r.authorName}</span>
            <span className="text-[13px] text-ink-3">{day(r.createdAt)}</span>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">{meta.charAt(0).toUpperCase() + meta.slice(1)}</p>
        </div>
        {r.reportedByMe ? (
          <span className="shrink-0 pt-0.5 text-[12px] text-ink-3">Reported</span>
        ) : (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="-mr-2 -mt-1.5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink"
            aria-label={`Report review by ${r.authorName}`}
          >
            <Flag className="size-3.5" /> Report
          </button>
        )}
      </div>

      {r.body ? (
        <p className="mt-2.5 whitespace-pre-line text-[15px] leading-relaxed text-ink-2 text-pretty">{r.body}</p>
      ) : (
        <p className="mt-2.5 text-sm italic text-ink-3">Left a rating without a written review.</p>
      )}

      {editing ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-3 sm:p-4">
          <label htmlFor={fieldId} className="text-sm font-medium text-ink">
            {r.responseBody ? "Edit your reply" : `Reply as ${businessName}`}
          </label>
          <Textarea
            id={fieldId}
            className="mt-1.5"
            rows={4}
            value={draft}
            maxLength={MAX}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${fieldId}-help`}
            placeholder={
              r.rating >= 4 ? "Thank them and mention something specific about the visit." : "Acknowledge the concern and say what you'll do differently. Keep it calm — future clients read this too."
            }
            autoFocus
          />
          <div id={`${fieldId}-help`} className="mt-1.5 flex items-start justify-between gap-3 text-[12px]">
            {error ? (
              <span className="text-danger" role="alert">
                {error}
              </span>
            ) : (
              <span className="text-ink-3">Public — shown under the review on your profile.</span>
            )}
            <span className={cn("shrink-0 tabular", draft.length > MAX - 100 ? "text-warn" : "text-ink-3")}>
              {draft.length}/{MAX}
            </span>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setDraft(r.responseBody ?? "");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={save}>
              {r.responseBody ? "Save reply" : "Post reply"}
            </Button>
          </div>
        </div>
      ) : r.responseBody ? (
        <div className="mt-4 border-l-2 border-line-strong pl-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-ink">
              Your reply
              <span className="font-normal text-ink-3">
                {r.respondedAt ? ` · ${day(r.respondedAt)}` : ""}
                {r.responderName ? ` · ${r.responderName}` : ""}
              </span>
            </p>
            <button type="button" onClick={() => setEditing(true)} className="-mr-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              <Pencil className="size-3.5" /> Edit
            </button>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-2">{r.responseBody}</p>
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="secondary" size="sm" icon={<MessageSquareReply className="size-4" />} onClick={() => setEditing(true)}>
            Reply
          </Button>
        </div>
      )}

      {reporting && <ReportDialog reviewId={r.id} onClose={() => setReporting(false)} />}
    </li>
  );
}

const REASONS = [
  { value: "fake", label: "Not a real client or visit" },
  { value: "inappropriate", label: "Offensive or inappropriate" },
  { value: "harassment", label: "Harassment or personal attack" },
  { value: "spam", label: "Spam or advertising" },
  { value: "other", label: "Something else" },
] as const;

function ReportDialog({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("fake");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api("/api/reports", { body: { targetType: "review", targetId: reviewId, reason, details: details || null } });
      toast.success("Thanks — our team will review it", { description: "The review stays up while we look into it. We'll only remove it if it breaks our review rules." });
      router.refresh();
      onClose();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Report this review"
      description="Kept's moderation team checks reports against our review rules. A low rating on its own isn't a reason to remove a review."
      size="sm"
      locked={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Send report
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What's wrong with it?">
          {(p) => (
            <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Details" optional hint="Anything that helps us check, e.g. you have no record of this client.">
          {(p) => <Textarea {...p} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
