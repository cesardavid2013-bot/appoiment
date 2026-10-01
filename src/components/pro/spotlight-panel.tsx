"use client";

import { ArrowRight, Pause, Play, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { api, type ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export type SpotlightCampaign = {
  id: string;
  status: "active" | "paused" | "ended";
  categoryId: string | null;
  categoryName: string | null;
  startsAt: string;
  endsAt: string;
  impressions: number;
  clicks: number;
};

type Props = {
  current: SpotlightCampaign | null;
  past: SpotlightCampaign[];
  categories: { id: string; name: string }[];
  blockedReason: string | null;
  timezone: string;
  now: number;
  canPublish: boolean;
};

const nf = new Intl.NumberFormat("en-US");
const ctr = (c: { impressions: number; clicks: number }) => (c.impressions ? `${((c.clicks / c.impressions) * 100).toFixed(c.clicks / c.impressions < 0.1 ? 1 : 0)}%` : "—");
const target = (c: SpotlightCampaign) => (c.categoryName ? `${c.categoryName} searches` : "All searches you match");

export function SpotlightPanel({ current, past, categories, blockedReason, timezone, now, canPublish }: Props) {
  const router = useRouter();
  const [days, setDays] = useState<"7" | "14" | "30">("14");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState<null | "start" | "pause" | "resume" | "end">(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const selectId = useId();
  const day = (iso: string) => fmtDate(iso, timezone, { month: "short", day: "numeric" });
  const range = (c: SpotlightCampaign) => (day(c.startsAt) === day(c.endsAt) ? day(c.startsAt) : `${day(c.startsAt)} – ${day(c.endsAt)}`);

  async function start() {
    setBusy("start");
    try {
      await api("/api/pro/spotlight", { body: { days: Number(days), categoryId: categoryId || null } });
      toast.success("Spotlight is on", { description: `Your profile can now appear as a promoted result for ${days} days.` });
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "pause" | "resume" | "end") {
    if (!current) return;
    setBusy(action);
    try {
      await api(`/api/pro/spotlight/${current.id}`, { body: { action } });
      toast.success(action === "pause" ? "Spotlight paused" : action === "resume" ? "Spotlight resumed" : "Campaign ended");
      setConfirmEnd(false);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const daysLeft = current ? Math.max(0, Math.ceil((new Date(current.endsAt).getTime() - now) / 86_400_000)) : 0;

  return (
    <div>
      {current ? (
        <div className="rounded-lg border border-line bg-surface">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold text-ink">{current.status === "active" ? "Running" : "Paused"}</p>
                {current.status === "active" ? (
                  <Badge tone="positive" dot>
                    Live in search
                  </Badge>
                ) : (
                  <Badge tone="attention">Not showing</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-3">
                {target(current)} · {range(current)} ·{" "}
                <span className="text-ink-2">{daysLeft === 0 ? "ends today" : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}</span>
              </p>
              {current.status === "paused" && <p className="mt-1 text-[13px] text-ink-3">Pausing doesn&apos;t extend the end date.</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {current.status === "active" ? (
                <Button variant="secondary" size="sm" icon={<Pause className="size-3.5" />} loading={busy === "pause"} disabled={busy !== null} onClick={() => act("pause")}>
                  Pause
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={<Play className="size-3.5" />} loading={busy === "resume"} disabled={busy !== null || Boolean(blockedReason)} onClick={() => act("resume")}>
                  Resume
                </Button>
              )}
              <Button variant="danger" size="sm" icon={<Square className="size-3" />} disabled={busy !== null} onClick={() => setConfirmEnd(true)}>
                End
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-line border-t border-line">
            {[
              ["Impressions", nf.format(current.impressions)],
              ["Profile visits", nf.format(current.clicks)],
              ["Click rate", ctr(current)],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-3.5 sm:px-5">
                <dt className="text-[12px] text-ink-3">{label}</dt>
                <dd className="mt-0.5 text-xl font-semibold text-ink tabular">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-line px-4 py-3 text-[13px] text-ink-3 sm:px-5">
            {current.impressions === 0 && current.status === "active"
              ? "No impressions yet. One is counted each time your profile is shown as a promoted result on the first page of a matching search."
              : "An impression is counted each time you're shown as a promoted result; a visit when someone opens your profile from it."}
          </p>
        </div>
      ) : blockedReason ? (
        <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <p className="text-[15px] font-semibold text-ink">Spotlight isn&apos;t available yet</p>
          <p className="mt-1 max-w-xl text-sm text-ink-3">{blockedReason}</p>
          {canPublish && (
            <Link href="/pro/onboarding" className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md bg-ink px-4 text-sm font-medium text-bg">
              Finish setup <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <p className="text-[15px] font-semibold text-ink">Start a campaign</p>
          <p className="mt-1 text-sm text-ink-3">Runs from now for the length you pick. You can pause or end it any time.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-ink">Length</span>
              <Segmented
                label="Campaign length"
                value={days}
                onChange={setDays}
                options={[
                  { value: "7", label: "7 days" },
                  { value: "14", label: "14 days" },
                  { value: "30", label: "30 days" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={selectId} className="block text-sm font-medium text-ink">
                Show for
              </label>
              <Select id={selectId} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Any matching search</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} searches only
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-ink-3">
              Cost: <span className="font-medium text-ink">free</span> while Kept is launching.
            </p>
            <Button onClick={start} loading={busy === "start"}>
              Start Spotlight
            </Button>
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-[13px] font-semibold text-ink-2">Past campaigns</h3>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">Past Spotlight campaigns</caption>
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Dates
                  </th>
                  <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">
                    Shown for
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    <span className="sm:hidden">Impr.</span>
                    <span className="hidden sm:inline">Impressions</span>
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Visits
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {past.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 text-ink">
                      <span className="whitespace-nowrap">{range(c)}</span>
                      <span className="block text-[12px] text-ink-3 sm:hidden">{target(c)}</span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-ink-2 sm:table-cell">{target(c)}</td>
                    <td className="px-4 py-2.5 text-right text-ink tabular">{nf.format(c.impressions)}</td>
                    <td className="px-4 py-2.5 text-right text-ink tabular">{nf.format(c.clicks)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-2 tabular">{ctr(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End this campaign?"
        description="Your profile stops appearing as a promoted result right away. Its numbers stay in your history, and you can start a new campaign whenever you like."
        confirmLabel="End campaign"
        loading={busy === "end"}
        onConfirm={() => act("end")}
      />
    </div>
  );
}
