"use client";

import { Check, Copy, MoreHorizontal, Pencil, Plus, Power, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Switch } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, EmptyState } from "@/components/ui/misc";
import { formatMoney, parseMoneyInput } from "@/domain/money";
import { describeDiscount, PROMOTION_STATUS_LABEL, type PromotionDisplayStatus } from "@/domain/promotions";
import { api, type ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

export type PromoRow = {
  id: string;
  code: string;
  name: string;
  kind: "percent" | "fixed";
  value: number;
  minSubtotalCents: number;
  serviceIds: string[] | null;
  newCustomersOnly: boolean;
  startsOn: string | null;
  endsOn: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  perCustomerLimit: number;
  isActive: boolean;
  status: PromotionDisplayStatus;
  discountCents: number;
};

type ServiceOpt = { id: string; name: string; status: string };

const TONE: Record<PromotionDisplayStatus, "positive" | "info" | "neutral" | "attention"> = {
  active: "positive",
  scheduled: "info",
  expired: "neutral",
  paused: "neutral",
  used_up: "attention",
};

/** yyyy-mm-dd → "Oct 4" (calendar date, no zone shift). */
const dayLabel = (d: string, withYear = false) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

function windowLabel(p: Pick<PromoRow, "startsOn" | "endsOn">) {
  if (p.startsOn && p.endsOn) return `${dayLabel(p.startsOn)} – ${dayLabel(p.endsOn)}`;
  if (p.endsOn) return `Until ${dayLabel(p.endsOn)}`;
  if (p.startsOn) return `From ${dayLabel(p.startsOn)}`;
  return "No end date";
}

function rulesLabel(p: PromoRow, services: ServiceOpt[], currency: string) {
  const parts: string[] = [];
  if (p.serviceIds?.length) {
    const names = p.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean) as string[];
    parts.push(names.length === 1 ? names[0] : `${p.serviceIds.length} services`);
  } else parts.push("All services");
  if (p.newCustomersOnly) parts.push("New clients only");
  if (p.minSubtotalCents > 0) parts.push(`Min. ${formatMoney(p.minSubtotalCents, currency, { compact: true })}`);
  parts.push(p.perCustomerLimit === 1 ? "Once per client" : `${p.perCustomerLimit}× per client`);
  return parts.join(" · ");
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy — select the code and copy it manually.");
        }
      }}
      className="group/copy inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 font-mono text-[13px] font-semibold tracking-wide text-ink hover:border-line-strong"
      aria-label={copied ? `${code} copied` : `Copy code ${code}`}
    >
      <span className="truncate">{code}</span>
      {copied ? <Check className="size-3.5 shrink-0 text-accent" /> : <Copy className="size-3.5 shrink-0 text-ink-3 group-hover/copy:text-ink" />}
    </button>
  );
}

export function PromoCodes({ items, services, currency }: { items: PromoRow[]; services: ServiceOpt[]; currency: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PromoRow | "new" | null>(null);

  async function toggle(p: PromoRow) {
    try {
      await api(`/api/pro/promotions/${p.id}`, { method: "PATCH", body: { isActive: !p.isActive } });
      toast.success(p.isActive ? `${p.code} turned off` : `${p.code} turned back on`, { description: p.isActive ? "Customers can no longer apply it. Existing bookings keep their discount." : undefined });
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Copied ${code}`);
    } catch {
      toast.error("Couldn't copy — select the code and copy it manually.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="codes-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
            Promo codes
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-3">Customers enter a code at checkout. The discount comes off the service price before tax.</p>
        </div>
        {items.length > 0 && (
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")} className="shrink-0">
            New code
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong">
          <EmptyState
            icon={<Tag />}
            title="No promo codes yet"
            description="Share a code on Instagram or with regulars. Customers type it at checkout and the discount is applied to their booking automatically."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
                Create a code
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((p) => (
            <li key={p.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto] sm:items-center", !p.isActive && "opacity-75")}>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CopyCode code={p.code} />
                  <span className="text-[15px] font-medium text-ink">{describeDiscount(p.kind, p.value, currency)}</span>
                  <Badge tone={TONE[p.status]}>{PROMOTION_STATUS_LABEL[p.status]}</Badge>
                </div>
                <p className="mt-1.5 truncate text-[13px] text-ink-2">{p.name}</p>
                <p className="mt-0.5 text-[13px] text-ink-3">{rulesLabel(p, services, currency)}</p>
                <p className="mt-0.5 text-[13px] text-ink-3 sm:hidden">
                  {windowLabel(p)} · {p.redemptionCount}
                  {p.maxRedemptions != null ? ` of ${p.maxRedemptions}` : ""} used
                </p>
              </div>
              <div className="hidden text-[13px] text-ink-2 sm:block">{windowLabel(p)}</div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-ink tabular">
                  {p.redemptionCount}
                  <span className="font-normal text-ink-3">{p.maxRedemptions != null ? ` / ${p.maxRedemptions}` : ""} used</span>
                </p>
                {p.discountCents > 0 && <p className="text-[12px] text-ink-3 tabular">{formatMoney(p.discountCents, currency)} given</p>}
              </div>
              <Menu>
                <MenuTrigger className="col-start-2 row-start-1 -mr-2 -mt-1 flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink sm:col-start-4 sm:mr-0 sm:mt-0 sm:size-9" aria-label={`Actions for ${p.code}`}>
                  <MoreHorizontal className="size-4" />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Pencil />} onSelect={() => setEditing(p)}>
                    Edit
                  </MenuItem>
                  <MenuItem icon={<Copy />} onSelect={() => copy(p.code)}>
                    Copy code
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Power />} danger={p.isActive} onSelect={() => toggle(p)}>
                    {p.isActive ? "Turn off" : "Turn back on"}
                  </MenuItem>
                </MenuContent>
              </Menu>
            </li>
          ))}
        </ul>
      )}

      {editing && <PromoDialog key={editing === "new" ? "new" : editing.id} promo={editing === "new" ? null : editing} services={services} currency={currency} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PromoDialog({ promo, services, currency, onClose }: { promo: PromoRow | null; services: ServiceOpt[]; currency: string; onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState(promo?.code ?? "");
  const [name, setName] = useState(promo?.name ?? "");
  const [kind, setKind] = useState<"percent" | "fixed">(promo?.kind ?? "percent");
  const [amount, setAmount] = useState(promo ? (promo.kind === "percent" ? String(promo.value / 100) : (promo.value / 100).toFixed(2).replace(/\.00$/, "")) : "");
  const [scope, setScope] = useState<"all" | "some">(promo?.serviceIds?.length ? "some" : "all");
  const [serviceIds, setServiceIds] = useState<string[]>(promo?.serviceIds ?? []);
  const [minSpend, setMinSpend] = useState(promo?.minSubtotalCents ? (promo.minSubtotalCents / 100).toFixed(2).replace(/\.00$/, "") : "");
  const [startsOn, setStartsOn] = useState(promo?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(promo?.endsOn ?? "");
  const [maxUses, setMaxUses] = useState(promo?.maxRedemptions != null ? String(promo.maxRedemptions) : "");
  const [perClient, setPerClient] = useState(String(promo?.perCustomerLimit ?? 1));
  const [newOnly, setNewOnly] = useState(promo?.newCustomersOnly ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  function validate() {
    const f: Record<string, string> = {};
    let value: number | null = null;
    if (kind === "percent") {
      const n = Number(amount);
      if (!amount.trim()) f.value = "Enter the discount";
      else if (!Number.isInteger(n) || n < 1) f.value = "Use a whole percentage, like 15";
      else if (n > 100) f.value = "A percentage discount can't be more than 100%";
      else value = n;
    } else {
      const c = parseMoneyInput(amount);
      if (!amount.trim()) f.value = "Enter the discount";
      else if (c == null || c < 1) f.value = "Enter an amount like 10 or 12.50";
      else value = c;
    }
    let minSubtotalCents = 0;
    if (minSpend.trim()) {
      const c = parseMoneyInput(minSpend);
      if (c == null) f.minSubtotalCents = "Enter an amount like 40";
      else minSubtotalCents = c;
    }
    if (scope === "some" && serviceIds.length === 0) f.serviceIds = "Pick at least one service, or choose All services";
    const max = maxUses.trim() ? Number(maxUses) : null;
    if (max != null && (!Number.isInteger(max) || max < 1)) f.maxRedemptions = "Use a whole number, or leave it blank for no limit";
    const per = Number(perClient);
    if (!Number.isInteger(per) || per < 1 || per > 100) f.perCustomerLimit = "Use a number from 1 to 100";
    if (startsOn && endsOn && endsOn < startsOn) f.endsOn = "The last day can't be before the first day";
    return { f, value, minSubtotalCents, max, per };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (Object.keys(v.f).length) {
      setFields(v.f);
      return;
    }
    setFields({});
    setSaving(true);
    try {
      const body = {
        code,
        name,
        kind,
        value: v.value,
        minSubtotalCents: v.minSubtotalCents,
        serviceIds: scope === "some" ? serviceIds : null,
        newCustomersOnly: newOnly,
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        maxRedemptions: v.max,
        perCustomerLimit: v.per,
        isActive: promo?.isActive ?? true,
      };
      if (promo) await api(`/api/pro/promotions/${promo.id}`, { method: "PUT", body });
      else await api("/api/pro/promotions", { body });
      toast.success(promo ? `${code.trim().toUpperCase()} updated` : `${code.trim().toUpperCase()} is ready to share`);
      router.refresh();
      onClose();
    } catch (err) {
      const e = err as ApiError;
      setFields(e.fields ?? {});
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const preview = (() => {
    const n = kind === "percent" ? Number(amount) * 100 : parseMoneyInput(amount);
    return n && n > 0 ? describeDiscount(kind, n, currency) : null;
  })();

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={promo ? `Edit ${promo.code}` : "New promo code"}
      description={promo && promo.redemptionCount > 0 ? `Used ${promo.redemptionCount} ${promo.redemptionCount === 1 ? "time" : "times"}. Changes apply to future bookings only.` : "Customers enter the code at checkout. Discounts come off the service price before tax."}
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="promo-form" loading={saving}>
            {promo ? "Save changes" : "Create code"}
          </Button>
        </>
      }
    >
      <form id="promo-form" onSubmit={save} className="space-y-5" noValidate>
        <FormError message={error && !Object.keys(fields).length ? error : null} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Letters, numbers and dashes. Not case-sensitive." error={fields.code}>
            {(p) => <Input {...p} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))} maxLength={24} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="SPRING20" className="font-mono uppercase tracking-wide" />}
          </Field>
          <Field label="Name" hint="Shown at checkout next to the discount." error={fields.name}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Spring welcome" />}
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Discount</legend>
          <div className="flex flex-wrap items-start gap-3">
            <Segmented
              label="Discount type"
              value={kind}
              onChange={(k) => {
                setKind(k);
                setAmount("");
              }}
              options={[
                { value: "percent", label: "Percent" },
                { value: "fixed", label: "Amount" },
              ]}
            />
            <div className="relative w-36">
              {kind === "fixed" && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">{currency === "USD" ? "$" : currency}</span>}
              <Input
                aria-label={kind === "percent" ? "Percent off" : "Amount off"}
                aria-invalid={fields.value ? true : undefined}
                aria-describedby={fields.value ? "promo-value-error" : undefined}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn("tabular", kind === "fixed" ? "pl-7" : "pr-8")}
                placeholder={kind === "percent" ? "15" : "10"}
              />
              {kind === "percent" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">%</span>}
            </div>
            {preview && !fields.value && (
              <p className="self-center text-sm text-ink-3" aria-live="polite">
                {preview} each booking
              </p>
            )}
          </div>
          {fields.value && (
            <p id="promo-value-error" className="text-[13px] text-danger" role="alert">
              {fields.value}
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Applies to</legend>
          <Segmented
            label="Services"
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: "All services" },
              { value: "some", label: "Specific services" },
            ]}
          />
          {scope === "some" && (
            <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-line px-3 py-1.5">
              {services.length === 0 ? (
                <p className="py-2 text-sm text-ink-3">You don&apos;t have any services yet.</p>
              ) : (
                services.map((s) => (
                  <Checkbox
                    key={s.id}
                    checked={serviceIds.includes(s.id)}
                    onCheckedChange={(on) => setServiceIds((ids) => (on ? [...ids, s.id] : ids.filter((x) => x !== s.id)))}
                    label={s.name}
                    description={s.status === "hidden" ? "Hidden from your profile" : undefined}
                  />
                ))
              )}
            </div>
          )}
          {fields.serviceIds && (
            <p className="text-[13px] text-danger" role="alert">
              {fields.serviceIds}
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day" optional hint="Leave blank to start now." error={fields.startsOn}>
            {(p) => <Input {...p} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}
          </Field>
          <Field label="Last day" optional hint="Works until the end of this day." error={fields.endsOn}>
            {(p) => <Input {...p} type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Total uses" optional hint="Blank = no limit." error={fields.maxRedemptions}>
            {(p) => <Input {...p} inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder="No limit" className="tabular" />}
          </Field>
          <Field label="Uses per client" error={fields.perCustomerLimit}>
            {(p) => <Input {...p} inputMode="numeric" value={perClient} onChange={(e) => setPerClient(e.target.value.replace(/\D/g, ""))} className="tabular" />}
          </Field>
          <Field label="Minimum spend" optional hint="Before tax." error={fields.minSubtotalCents}>
            {(p) => <Input {...p} inputMode="decimal" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} placeholder="None" className="tabular" />}
          </Field>
        </div>

        <div className="rounded-md border border-line px-3 py-2">
          <Switch checked={newOnly} onCheckedChange={setNewOnly} label="New clients only" description="Only people who haven't booked with you before can use it." />
        </div>
      </form>
    </Dialog>
  );
}
