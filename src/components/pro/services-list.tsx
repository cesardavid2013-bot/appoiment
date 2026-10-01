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
      toast.success(`${archiving.name} archived`, { description: res.upcomingBookings ? `${res.upcomingBookings} upcoming booking${res.upcomingBookings === 1 ? "" : "s"} will still go ahead.` : undefined });
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
      toast.success(`${s.name} restored as hidden — review and publish it.`);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  }

  if (items.length === 0)
    return (
      <EmptyState
        title="No services yet"
        description="Create your first service to start taking bookings. Add options like length, size or add-ons that change the price and time."
        action={
          <ButtonLink href="/pro/services/new" icon={<Plus className="size-4" />}>
            Create a service
          </ButtonLink>
        }
      />
    );

  return (
    <div>
      {sections.map((section) => (
        <section key={section || "default"} className="mb-8">
          {(section || sections.length > 1) && <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{section || "Other"}</h2>}
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {live
              .filter((s) => (s.menuSection ?? "") === section)
              .map((s) => {
                const i = order.indexOf(s.id);
                return (
                  <li key={s.id} className={cn("group flex items-center gap-2 px-2 py-3 sm:px-3", s.status === "hidden" && "opacity-70")}>
                    <div className="hidden w-6 flex-col items-center text-ink-3 sm:flex">
                      <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} className="rounded p-0.5 opacity-35 hover:bg-surface-2 hover:text-ink disabled:invisible group-hover:opacity-100 group-focus-within:opacity-100" aria-label={`Move ${s.name} up`}>
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => move(s.id, 1)} disabled={i === order.length - 1} className="rounded p-0.5 opacity-35 hover:bg-surface-2 hover:text-ink disabled:invisible group-hover:opacity-100 group-focus-within:opacity-100" aria-label={`Move ${s.name} down`}>
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>
                    <Link href={`/pro/services/${s.id}`} className="min-w-0 flex-1 px-1 py-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[15px] font-medium text-ink">{s.name}</span>
                        {s.status === "hidden" && <Badge>Hidden</Badge>}
                        {s.capacity > 1 && <Badge tone="info">Group · {s.capacity}</Badge>}
                      </div>
                      <div className="mt-0.5 text-[13px] text-ink-3">
                        {formatDuration(s.durationMinutes)}
                        {s.optionCount > 0 && ` · ${s.optionCount} option ${s.optionCount === 1 ? "group" : "groups"}`}
                        {s.staffCount === 0 ? <span className="text-warn"> · Nobody assigned</span> : s.staffCount > 1 ? ` · ${s.staffCount} staff` : ""}
                        {s.bookings30 > 0 && ` · ${s.bookings30} booked this month`}
                      </div>
                    </Link>
                    <span className="w-24 shrink-0 text-right text-[15px] font-medium text-ink tabular">{formatPriceLabel(s, currency)}</span>
                    <Menu>
                      <MenuTrigger className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Actions for ${s.name}`}>
                        <MoreHorizontal className="size-4" />
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => router.push(`/pro/services/${s.id}`)}>Edit</MenuItem>
                        <MenuItem icon={<Copy />} onSelect={() => router.push(`/pro/services/new?copy=${s.id}`)}>
                          Duplicate
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem danger icon={<Archive />} onSelect={() => setArchiving(s)}>
                          Archive
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
            {showArchived ? "Hide" : "Show"} {archived.length} archived
          </button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {archived.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="text-ink-2">{s.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => restore(s)} icon={<RotateCcw className="size-4" />}>
                    Restore
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
        title={`Archive ${archiving?.name}?`}
        description="Customers won't be able to book it. Existing appointments keep every detail and go ahead as planned. You can restore it any time."
        confirmLabel="Archive"
        onConfirm={archive}
        loading={busy}
      />
    </div>
  );
}

/** Shown instead of the editor when a service is archived: restore first, then edit. */
export function ArchivedServiceNotice({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-xl rounded-xl border border-line bg-surface p-6">
      <p className="font-semibold text-ink">This service is archived</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-3">Customers can&rsquo;t book it and it&rsquo;s hidden from your profile. Past bookings keep their details. Restore it to edit — it comes back hidden so you can review it first.</p>
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
        Restore service
      </Button>
    </div>
  );
}
