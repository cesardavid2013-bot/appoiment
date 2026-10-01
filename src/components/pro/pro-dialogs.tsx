"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SlotPicker } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { addDaysIso, clockToMinutes, localMinuteToInstant, todayIn } from "@/domain/time";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

type TeamMember = { id: string; name: string };
type ServiceLite = { id: string; name: string; durationMinutes: number };
type Customer = { id: string; name: string; email: string | null; phone: string | null; completedCount: number };
type EditService = { optionGroups: { id?: string; name: string; selection: "single" | "multiple"; required: boolean; options: { id?: string; name: string; isActive: boolean }[] }[]; locationIds: string[] };

export function NewAppointmentDialog({
  open,
  onOpenChange,
  services,
  team,
  timezone,
  canAssignOthers,
  selfMemberId,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  services: ServiceLite[];
  team: TeamMember[];
  timezone: string;
  canAssignOthers: boolean;
  selfMemberId: string;
  initial?: { start?: string; memberId?: string; customer?: Customer };
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(initial?.customer ?? null);
  const [newCust, setNewCust] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [q, setQ] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [memberId, setMemberId] = useState(initial?.memberId ?? (canAssignOthers ? (team[0]?.id ?? selfMemberId) : selfMemberId));
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"open" | "custom">(initial?.start ? "custom" : "open");
  const [start, setStart] = useState<string | null>(initial?.start ?? null);
  const [date, setDate] = useState(() => (initial?.start ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(initial.start)) : todayIn(timezone)));
  const [time, setTime] = useState(() => (initial?.start ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(new Date(initial.start)) : "10:00"));
  const [outside, setOutside] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useQuery({
    queryKey: ["cust-lookup", q],
    enabled: open && q.trim().length >= 2 && !customer,
    queryFn: ({ signal }) => api<Customer[]>(`/api/pro/customers?lookup=${encodeURIComponent(q.trim())}`, { signal }),
    staleTime: 10_000,
  });
  const svc = useQuery({
    queryKey: ["pro-service", serviceId],
    enabled: open && Boolean(serviceId),
    queryFn: () => api<EditService>(`/api/pro/services/${serviceId}`),
    staleTime: 60_000,
  });
  const groups = svc.data?.optionGroups ?? [];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let startIso = start;
      if (mode === "custom") {
        const minutes = clockToMinutes(time);
        const ms = minutes == null ? null : localMinuteToInstant(date, minutes, timezone);
        if (ms == null) throw new ApiError("Choose a valid date and time.", "validation", 422);
        startIso = new Date(ms).toISOString();
      }
      if (!startIso) throw new ApiError("Choose a time.", "validation", 422);
      await api("/api/pro/appointments", {
        body: {
          serviceId,
          memberId,
          start: startIso,
          optionIds,
          customerId: customer?.id ?? null,
          newCustomer: customer ? null : newCust ? { name: newCust.name, phone: newCust.phone || null, email: newCust.email || null } : null,
          note: note.trim() || null,
          allowOutsideHours: mode === "custom" && outside,
          source: "manual",
        },
      });
      toast.success("Appointment added");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  const hasCustomer = Boolean(customer || (newCust && newCust.name.trim()));
  const requiredMissing = groups.some((g) => g.required && g.options.some((o) => o.isActive) && !g.options.some((o) => o.id && optionIds.includes(o.id)));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New appointment"
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!hasCustomer || !serviceId || requiredMissing || (mode === "open" && !start)}>
            Add appointment
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <FormError message={error} />
        <section>
          <p className="mb-2 text-sm font-semibold text-ink">Client</p>
          {customer ? (
            <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-ink">{customer.name}</p>
                <p className="truncate text-[13px] text-ink-3">{[customer.phone, customer.email].filter(Boolean).join(" · ") || `${customer.completedCount} visits`}</p>
              </div>
              <button type="button" className="text-sm font-medium text-ink underline underline-offset-4" onClick={() => setCustomer(null)}>
                Change
              </button>
            </div>
          ) : newCust ? (
            <div className="space-y-3 rounded-md border border-line p-3.5">
              <Field label="Name">{(p) => <Input {...p} value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} autoFocus />}</Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Phone" optional>{(p) => <Input {...p} type="tel" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />}</Field>
                <Field label="Email" optional>{(p) => <Input {...p} type="email" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} />}</Field>
              </div>
              <button type="button" className="text-sm font-medium text-ink-2 hover:text-ink" onClick={() => setNewCust(null)}>
                Search existing clients instead
              </button>
            </div>
          ) : (
            <div>
              <label className="flex h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 md:h-10">
                <Search className="size-4 text-ink-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email" className="h-full flex-1 bg-transparent focus:outline-none" aria-label="Search clients" autoFocus />
              </label>
              <ul className="mt-1.5">
                {(lookup.data ?? []).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCustomer(c)} className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left hover:bg-surface-2">
                      <span className="text-sm font-medium text-ink">{c.name}</span>
                      <span className="text-[13px] text-ink-3">{c.phone ?? c.email ?? ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {q.trim().length >= 2 && lookup.data && lookup.data.length === 0 && <p className="px-1 py-2 text-sm text-ink-3">No clients match “{q}”.</p>}
              <button type="button" onClick={() => setNewCust({ name: q.trim(), phone: "", email: "" })} className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:underline">
                <UserPlus className="size-4" /> New client
              </button>
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Service">
            {(p) => (
              <Select {...p} value={serviceId} onChange={(e) => { setServiceId(e.target.value); setOptionIds([]); setStart(null); }}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.durationMinutes} min
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {canAssignOthers && team.length > 1 && (
            <Field label="With">
              {(p) => (
                <Select {...p} value={memberId} onChange={(e) => { setMemberId(e.target.value); setStart(null); }}>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {groups.map((g) => (
            <Field key={g.id ?? g.name} label={g.name} optional={!g.required}>
              {(p) =>
                g.selection === "single" ? (
                  <Select {...p} value={g.options.find((o) => o.id && optionIds.includes(o.id))?.id ?? ""} onChange={(e) => setOptionIds((prev) => [...prev.filter((id) => !g.options.some((o) => o.id === id)), ...(e.target.value ? [e.target.value] : [])])}>
                    <option value="">{g.required ? "Choose…" : "None"}</option>
                    {g.options.filter((o) => o.isActive).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="flex flex-wrap gap-2" id={p.id}>
                    {g.options.filter((o) => o.isActive).map((o) => {
                      const on = Boolean(o.id && optionIds.includes(o.id));
                      return (
                        <button key={o.id} type="button" aria-pressed={on} onClick={() => setOptionIds((prev) => (on ? prev.filter((x) => x !== o.id) : [...prev, o.id!]))} className={cn("h-8 rounded-md border px-2.5 text-[13px]", on ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2")}>
                          {o.name}
                        </button>
                      );
                    })}
                  </div>
                )
              }
            </Field>
          ))}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">When</p>
            <Segmented label="Time mode" size="sm" value={mode} onChange={(v) => setMode(v)} options={[{ value: "open", label: "Open times" }, { value: "custom", label: "Custom" }]} />
          </div>
          {mode === "open" ? (
            serviceId && !requiredMissing ? (
              <SlotPicker key={`${serviceId}-${memberId}-${optionIds.join()}`} serviceId={serviceId} memberId={memberId} locationId={svc.data?.locationIds.length === 1 ? svc.data.locationIds[0] : null} optionIds={optionIds} timezone={timezone} value={start} onChange={setStart} endpoint="/api/pro/slots" />
            ) : (
              <p className="text-sm text-ink-3">Choose the service options first.</p>
            )
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">{(p) => <Input {...p} type="date" value={date} min={addDaysIso(todayIn(timezone), -1)} onChange={(e) => setDate(e.target.value)} />}</Field>
                <Field label="Start time">{(p) => <Input {...p} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
              </div>
              <Checkbox checked={outside} onCheckedChange={setOutside} label="Book outside working hours" description="Still never overlaps another appointment." />
            </div>
          )}
        </section>

        <Field label="Note" optional>
          {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />}
        </Field>
      </div>
    </Dialog>
  );
}

const REASONS = [
  ["break", "Break"],
  ["personal", "Personal"],
  ["vacation", "Vacation"],
  ["sick", "Sick day"],
  ["holiday", "Holiday"],
  ["other", "Other"],
] as const;

export function BlockTimeDialog({ open, onOpenChange, team, timezone, canAll, selfMemberId }: { open: boolean; onOpenChange: (o: boolean) => void; team: TeamMember[]; timezone: string; canAll: boolean; selfMemberId: string }) {
  const router = useRouter();
  const today = todayIn(timezone);
  const [who, setWho] = useState<string>(selfMemberId);
  const [kind, setKind] = useState<"hours" | "days">("hours");
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("13:00");
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("break");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const startMs = kind === "hours" ? localMinuteToInstant(date, clockToMinutes(from) ?? -1, timezone) : localMinuteToInstant(date, 0, timezone);
      const endMs = kind === "hours" ? localMinuteToInstant(date, clockToMinutes(to) ?? -1, timezone) : localMinuteToInstant(addDaysIso(endDate, 1), 0, timezone);
      if (startMs == null || endMs == null || endMs <= startMs) throw new ApiError("Check the start and end.", "validation", 422);
      const res = await api<{ conflicts: { reference: string }[] }>("/api/pro/blocks", {
        body: { memberId: who === "all" ? null : who, startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString(), reason, note: note.trim() || null },
      });
      if (res.conflicts.length) toast.warning("Time blocked — but you have appointments then", { description: `${res.conflicts.length} existing appointment${res.conflicts.length === 1 ? "" : "s"} still need${res.conflicts.length === 1 ? "s" : ""} your attention.` });
      else toast.success("Time blocked");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Block time"
      description="Blocked time can't be booked. Existing appointments aren't touched."
      size="sm"
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Block time
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Segmented label="Length" value={kind} onChange={(v) => { setKind(v); if (v === "days" && reason === "break") setReason("vacation"); }} options={[{ value: "hours", label: "Part of a day" }, { value: "days", label: "Whole days" }]} />
        {canAll && team.length > 1 && (
          <Field label="For">
            {(p) => (
              <Select {...p} value={who} onChange={(e) => setWho(e.target.value)}>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value="all">Everyone (business closed)</option>
              </Select>
            )}
          </Field>
        )}
        {kind === "hours" ? (
          <>
            <Field label="Date">{(p) => <Input {...p} type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">{(p) => <Input {...p} type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label="To">{(p) => <Input {...p} type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First day">{(p) => <Input {...p} type="date" value={date} min={today} onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />}</Field>
            <Field label="Last day">{(p) => <Input {...p} type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />}</Field>
          </div>
        )}
        <Field label="Reason">
          {(p) => (
            <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Note" optional hint="Only your team sees this.">
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}
        </Field>
      </div>
    </Dialog>
  );
}
