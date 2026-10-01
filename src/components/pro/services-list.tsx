"use client";

import { Archive, ChevronDown, ChevronUp, Copy, MoreHorizontal, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, EmptyState } from "@/components/ui/misc";
import { formatDuration, formatPriceLabel } from "@/domain/money";
import { useLocale, useT } from "@/i18n/client";
import { priceWords } from "@/i18n/helpers";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

export type ServiceRow = {
  id: string;
  name: string;
  menuSection: string | null;
  durationMinutes: number;
  priceType: string;
  priceCents: number;
  salePriceCents: number | null;
  priceMaxCents: number | null;
  status: "active" | "hidden" | "archived";
  capacity: number;
  optionCount: number;
  staffCount: number;
  bookings30: number;
};

export function ServicesList({ items, currency }: { items: ServiceRow[]; currency: string }) {
  const t = useT("proSetup");
  const tr = useT();
  const { intl } = useLocale();
  const router = useRouter();
  const [order, setOrder] = useState(items.filter((s) => s.status !== "archived").map((s) => s.id));
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<ServiceRow | null>(null);
  const [busy, setBusy] = useState(false);
  const live = order.map((id) => items.find((s) => s.id === id)!).filter(Boolean);
  const archived = items.filter((s) => s.status === "archived");
  const sections = [...new Set(live.map((s) => s.menuSection ?? ""))];

  async function move(id: string, dir: -1 | 1) {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    try {
      await api("/api/pro/services/reorder", { body: { ids: next } });
    } catch (err) {
      toast.error((err as ApiError).message);
      setOrder(order);
    }
  }

  async function archive() {
    if (!archiving) return;
    setBusy(true);
    try {
      const res = await api<{ upcomingBookings: number }>(`/api/pro/services/${archiving.id}/archive`, { method: "POST", body: {} });
      toast.success(t("services.list.archived", { name: archiving.name }), { description: res.upcomingBookings ? t("services.list.archivedUpcoming", { count: res.upcomingBookings }) : undefined });
      setArchiving(null);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(s: ServiceRow) {
    try {
      await api(`/api/pro/services/${s.id}/restore`, { method: "POST", body: {} });
      toast.success(t("services.list.restored", { name: s.name }));
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  }

  if (items.length === 0)
    return (
      <EmptyState
        title={t("services.list.emptyTitle")}
        description={t("services.list.emptyBody")}
        action={
          <ButtonLink href="/pro/services/new" icon={<Plus className="size-4" />}>
            {t("services.list.create")}
          </ButtonLink>
        }
      />
    );

  return (
    <div>
      {sections.map((section) => (
        <section key={section || "default"} className="mb-8">
          {(section || sections.length > 1) && <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{section || t("services.list.otherSection")}</h2>}
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {live
              .filter((s) => (s.menuSection ?? "") === section)
              .map((s) => {
                const i = order.indexOf(s.id);
                return (
                  <li key={s.id} className={cn("group flex items-center gap-2 px-2 py-3 sm:px-3", s.status === "hidden" && "opacity-70")}>
                    <div className="hidden w-6 flex-col items-center text-ink-3 sm:flex">
                      <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} className="rounded p-0.5 opacity-35 hover:bg-surface-2 hover:text-ink disabled:invisible group-hover:opacity-100 group-focus-within:opacity-100" aria-label={t("services.list.moveUp", { name: s.name })}>
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => move(s.id, 1)} disabled={i === order.length - 1} className="rounded p-0.5 opacity-35 hover:bg-surface-2 hover:text-ink disabled:invisible group-hover:opacity-100 group-focus-within:opacity-100" aria-label={t("services.list.moveDown", { name: s.name })}>
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>
                    <Link href={`/pro/services/${s.id}`} className="min-w-0 flex-1 px-1 py-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[15px] font-medium text-ink">{s.name}</span>
                        {s.status === "hidden" && <Badge>{t("services.list.hidden")}</Badge>}
                        {s.capacity > 1 && <Badge tone="info">{t("services.list.group", { capacity: s.capacity })}</Badge>}
                      </div>
                      <div className="mt-0.5 text-[13px] text-ink-3">
                        {formatDuration(s.durationMinutes, intl)}
                        {s.optionCount > 0 && ` · ${t("services.list.optionGroups", { count: s.optionCount })}`}
                        {s.staffCount === 0 ? <span className="text-warn"> · {t("services.list.nobodyAssigned")}</span> : s.staffCount > 1 ? ` · ${t("services.list.staff", { count: s.staffCount })}` : ""}
                        {s.bookings30 > 0 && ` · ${t("services.list.bookedThisMonth", { count: s.bookings30 })}`}
                      </div>
                    </Link>
                    <span className="w-24 shrink-0 text-end text-[15px] font-medium text-ink tabular">{formatPriceLabel(s, currency, { intl, words: priceWords(tr) })}</span>
                    <Menu>
                      <MenuTrigger className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={t("services.list.actionsFor", { name: s.name })}>
                        <MoreHorizontal className="size-4" />
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => router.push(`/pro/services/${s.id}`)}>{t("services.list.edit")}</MenuItem>
                        <MenuItem icon={<Copy />} onSelect={() => router.push(`/pro/services/new?copy=${s.id}`)}>
                          {t("services.list.duplicate")}
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem danger icon={<Archive />} onSelect={() => setArchiving(s)}>
                          {t("services.list.archive")}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {archived.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-sm font-medium text-ink-3 hover:text-ink">
            {t(showArchived ? "services.list.hideArchived" : "services.list.showArchived", { count: archived.length })}
          </button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {archived.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="text-ink-2">{s.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => restore(s)} icon={<RotateCcw className="size-4" />}>
                    {t("services.list.restore")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={t("services.list.archiveTitle", { name: archiving?.name ?? "" })}
        description={t("services.list.archiveBody")}
        confirmLabel={t("services.list.archive")}
        onConfirm={archive}
        loading={busy}
      />
    </div>
  );
}

/** Shown instead of the editor when a service is archived: restore first, then edit. */
export function ArchivedServiceNotice({ id }: { id: string }) {
  const t = useT("proSetup");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-xl rounded-xl border border-line bg-surface p-6">
      <p className="font-semibold text-ink">{t("services.archivedNotice.title")}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-3">{t("services.archivedNotice.body")}</p>
      <Button
        className="mt-4"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/pro/services/${id}/restore`, { method: "POST", body: {} });
            router.refresh();
          } catch (err) {
            toast.error((err as ApiError).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("services.archivedNotice.restore")}
      </Button>
    </div>
  );
}
