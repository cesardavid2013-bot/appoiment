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
import { useLocale, useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import type { TFunction } from "@/i18n/translate";
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

const ctr = (c: { impressions: number; clicks: number }, intl: string) => {
  if (!c.impressions) return "—";
  const r = c.clicks / c.impressions;
  return new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: r < 0.1 ? 1 : 0, minimumFractionDigits: r < 0.1 ? 1 : 0 }).format(r);
};
const target = (c: SpotlightCampaign, t: TFunction) => (c.categoryName ? t("spotlight.categorySearches", { category: c.categoryName }) : t("spotlight.allSearches"));

export function SpotlightPanel({ current, past, categories, blockedReason, timezone, now, canPublish }: Props) {
  const router = useRouter();
  const t = useT("pro");
  const { intl } = useLocale();
  const nf = new Intl.NumberFormat(intl);
  const [days, setDays] = useState<"7" | "14" | "30">("14");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState<null | "start" | "pause" | "resume" | "end">(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const selectId = useId();
  const day = (iso: string) => fmtDate(iso, timezone, { month: "short", day: "numeric" }, intl);
  const range = (c: SpotlightCampaign) => (day(c.startsAt) === day(c.endsAt) ? day(c.startsAt) : `${day(c.startsAt)} – ${day(c.endsAt)}`);

  async function start() {
    setBusy("start");
    try {
      await api("/api/pro/spotlight", { body: { days: Number(days), categoryId: categoryId || null } });
      toast.success(t("spotlight.started"), { description: t("spotlight.startedBody", { count: Number(days) }) });
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
      toast.success(t(`spotlight.done.${action}`));
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
                <p className="text-[15px] font-semibold text-ink">{current.status === "active" ? t("spotlight.running") : t("spotlight.paused")}</p>
                {current.status === "active" ? (
                  <Badge tone="positive" dot>
                    {t("spotlight.live")}
                  </Badge>
                ) : (
                  <Badge tone="attention">{t("spotlight.notShowing")}</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-3">
                {target(current, t)} · {range(current)} · <span className="text-ink-2">{daysLeft === 0 ? t("spotlight.endsToday") : t("spotlight.daysLeft", { count: daysLeft })}</span>
              </p>
              {current.status === "paused" && <p className="mt-1 text-[13px] text-ink-3">{t("spotlight.pauseNote")}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {current.status === "active" ? (
                <Button variant="secondary" size="sm" icon={<Pause className="size-3.5" />} loading={busy === "pause"} disabled={busy !== null} onClick={() => act("pause")}>
                  {t("spotlight.pause")}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={<Play className="size-3.5" />} loading={busy === "resume"} disabled={busy !== null || Boolean(blockedReason)} onClick={() => act("resume")}>
                  {t("spotlight.resume")}
                </Button>
              )}
              <Button variant="danger" size="sm" icon={<Square className="size-3" />} disabled={busy !== null} onClick={() => setConfirmEnd(true)}>
                {t("spotlight.end")}
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-line border-t border-line">
            {[
              [t("spotlight.impressions"), nf.format(current.impressions)],
              [t("spotlight.profileVisits"), nf.format(current.clicks)],
              [t("spotlight.clickRate"), ctr(current, intl)],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-3.5 sm:px-5">
                <dt className="text-[12px] text-ink-3">{label}</dt>
                <dd className="mt-0.5 text-xl font-semibold text-ink tabular">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-line px-4 py-3 text-[13px] text-ink-3 sm:px-5">
            {current.impressions === 0 && current.status === "active"
              ? t("spotlight.noImpressions")
              : t("spotlight.impressionHint")}
          </p>
        </div>
      ) : blockedReason ? (
        <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <p className="text-[15px] font-semibold text-ink">{t("spotlight.unavailable")}</p>
          <p className="mt-1 max-w-xl text-sm text-ink-3">{blockedReason}</p>
          {canPublish && (
            <Link href="/pro/onboarding" className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md bg-ink px-4 text-sm font-medium text-bg">
              {t("spotlight.finishSetup")} <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <p className="text-[15px] font-semibold text-ink">{t("spotlight.startTitle")}</p>
          <p className="mt-1 text-sm text-ink-3">{t("spotlight.startBody")}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-ink">{t("block.length")}</span>
              <Segmented
                label={t("spotlight.lengthLabel")}
                value={days}
                onChange={setDays}
                options={[
                  { value: "7", label: t("insights.days", { count: 7 }) },
                  { value: "14", label: t("insights.days", { count: 14 }) },
                  { value: "30", label: t("insights.days", { count: 30 }) },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={selectId} className="block text-sm font-medium text-ink">
                {t("spotlight.showFor")}
              </label>
              <Select id={selectId} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{t("spotlight.anySearch")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t("spotlight.categoryOnly", { category: c.name })}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-ink-3">
              {rich(t("spotlight.cost"), { b: (ch) => <span className="font-medium text-ink">{ch}</span> })}
            </p>
            <Button onClick={start} loading={busy === "start"}>
              {t("spotlight.start")}
            </Button>
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-[13px] font-semibold text-ink-2">{t("spotlight.past")}</h3>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("spotlight.pastCaption")}</caption>
              <thead>
                <tr className="border-b border-line text-start text-[12px] text-ink-3">
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t("spotlight.dates")}
                  </th>
                  <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">
                    {t("spotlight.shownFor")}
                  </th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">
                    <span className="sm:hidden">{t("spotlight.impressionsShort")}</span>
                    <span className="hidden sm:inline">{t("spotlight.impressions")}</span>
                  </th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">
                    {t("spotlight.visits")}
                  </th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">
                    {t("spotlight.rate")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {past.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 text-ink">
                      <span className="whitespace-nowrap">{range(c)}</span>
                      <span className="block text-[12px] text-ink-3 sm:hidden">{target(c, t)}</span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-ink-2 sm:table-cell">{target(c, t)}</td>
                    <td className="px-4 py-2.5 text-end text-ink tabular">{nf.format(c.impressions)}</td>
                    <td className="px-4 py-2.5 text-end text-ink tabular">{nf.format(c.clicks)}</td>
                    <td className="px-4 py-2.5 text-end text-ink-2 tabular">{ctr(c, intl)}</td>
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
        title={t("spotlight.endTitle")}
        description={t("spotlight.endBody")}
        confirmLabel={t("spotlight.endConfirm")}
        loading={busy === "end"}
        onConfirm={() => act("end")}
      />
    </div>
  );
}
