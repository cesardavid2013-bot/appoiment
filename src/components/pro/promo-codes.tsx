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
import type { PromotionDisplayStatus } from "@/domain/promotions";
import { useLocale, useT } from "@/i18n/client";
import type { TFunction } from "@/i18n/translate";
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
const dayLabel = (d: string, intl: string) => new Intl.DateTimeFormat(intl, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** "20% off" / "$10 off". `value` is basis points (percent) or minor units (fixed). */
function discountLabel(t: TFunction, intl: string, kind: "percent" | "fixed", value: number, currency: string) {
  const amount = kind === "percent" ? new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 1 }).format(value / 10_000) : formatMoney(value, currency, { compact: true, intl });
  return t("promos.off", { amount });
}

function windowLabel(t: TFunction, intl: string, p: Pick<PromoRow, "startsOn" | "endsOn">) {
  if (p.startsOn && p.endsOn) return `${dayLabel(p.startsOn, intl)} – ${dayLabel(p.endsOn, intl)}`;
  if (p.endsOn) return t("promos.until", { date: dayLabel(p.endsOn, intl) });
  if (p.startsOn) return t("promos.from", { date: dayLabel(p.startsOn, intl) });
  return t("promos.noEnd");
}

function rulesLabel(t: TFunction, intl: string, p: PromoRow, services: ServiceOpt[], currency: string) {
  const parts: string[] = [];
  if (p.serviceIds?.length) {
    const names = p.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean) as string[];
    parts.push(names.length === 1 ? names[0] : t("promos.servicesCount", { count: p.serviceIds.length }));
  } else parts.push(t("promos.allServices"));
  if (p.newCustomersOnly) parts.push(t("promos.newOnly"));
  if (p.minSubtotalCents > 0) parts.push(t("promos.min", { amount: formatMoney(p.minSubtotalCents, currency, { compact: true, intl }) }));
  parts.push(t("promos.perClient", { count: p.perCustomerLimit }));
  return parts.join(" · ");
}

function CopyCode({ code }: { code: string }) {
  const t = useT("pro");
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
          toast.error(t("promos.copyFailed"));
        }
      }}
      className="group/copy inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 font-mono text-[13px] font-semibold tracking-wide text-ink hover:border-line-strong"
      aria-label={copied ? t("promos.copied", { code }) : t("promos.copyCode", { code })}
    >
      <span className="truncate">{code}</span>
      {copied ? <Check className="size-3.5 shrink-0 text-accent" /> : <Copy className="size-3.5 shrink-0 text-ink-3 group-hover/copy:text-ink" />}
    </button>
  );
}

export function PromoCodes({ items, services, currency }: { items: PromoRow[]; services: ServiceOpt[]; currency: string }) {
  const router = useRouter();
  const t = useT("pro");
  const { intl } = useLocale();
  const [editing, setEditing] = useState<PromoRow | "new" | null>(null);

  async function toggle(p: PromoRow) {
    try {
      await api(`/api/pro/promotions/${p.id}`, { method: "PATCH", body: { isActive: !p.isActive } });
      toast.success(p.isActive ? t("promos.turnedOff", { code: p.code }) : t("promos.turnedOn", { code: p.code }), {
        description: p.isActive ? t("promos.turnedOffBody") : undefined,
      });
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("promos.copiedToast", { code }));
    } catch {
      toast.error(t("promos.copyFailed"));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="codes-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
            {t("promos.title")}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-3">{t("promos.description")}</p>
        </div>
        {items.length > 0 && (
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")} className="shrink-0">
            {t("promos.newCode")}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong">
          <EmptyState
            icon={<Tag />}
            title={t("promos.emptyTitle")}
            description={t("promos.emptyBody")}
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
                {t("promos.createCode")}
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((p) => (
            <li
              key={p.id}
              className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto] sm:items-center", !p.isActive && "opacity-75")}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CopyCode code={p.code} />
                  <span className="text-[15px] font-medium text-ink">{discountLabel(t, intl, p.kind, p.value, currency)}</span>
                  <Badge tone={TONE[p.status]}>{t(`promos.status.${p.status}`)}</Badge>
                </div>
                <p className="mt-1.5 truncate text-[13px] text-ink-2">{p.name}</p>
                <p className="mt-0.5 text-[13px] text-ink-3">{rulesLabel(t, intl, p, services, currency)}</p>
                <p className="mt-0.5 text-[13px] text-ink-3 sm:hidden">
                  {windowLabel(t, intl, p)} ·{" "}
                  {p.maxRedemptions != null ? t("promos.usedOf", { used: p.redemptionCount.toLocaleString(intl), count: p.maxRedemptions }) : t("promos.used", { count: p.redemptionCount })}
                </p>
              </div>
              <div className="hidden text-[13px] text-ink-2 sm:block">{windowLabel(t, intl, p)}</div>
              <div className="hidden text-end sm:block">
                <p className="text-sm font-medium text-ink tabular">
                  {p.redemptionCount.toLocaleString(intl)}
                  <span className="font-normal text-ink-3">{p.maxRedemptions != null ? ` / ${p.maxRedemptions.toLocaleString(intl)}` : ""} {t("promos.usedSuffix")}</span>
                </p>
                {p.discountCents > 0 && <p className="text-[12px] text-ink-3 tabular">{t("promos.given", { amount: formatMoney(p.discountCents, currency, { intl }) })}</p>}
              </div>
              <Menu>
                <MenuTrigger
                  className="col-start-2 row-start-1 -me-2 -mt-1 flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink sm:col-start-4 sm:me-0 sm:mt-0 sm:size-9"
                  aria-label={t("promos.actions", { code: p.code })}
                >
                  <MoreHorizontal className="size-4" />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Pencil />} onSelect={() => setEditing(p)}>
                    {t("client.edit")}
                  </MenuItem>
                  <MenuItem icon={<Copy />} onSelect={() => copy(p.code)}>
                    {t("promos.copy")}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Power />} danger={p.isActive} onSelect={() => toggle(p)}>
                    {p.isActive ? t("promos.turnOff") : t("promos.turnOn")}
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
  const t = useT("pro");
  const { intl } = useLocale();
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
      if (!amount.trim()) f.value = t("promos.errors.value");
      else if (!Number.isInteger(n) || n < 1) f.value = t("promos.errors.percentWhole");
      else if (n > 100) f.value = t("promos.errors.percentMax");
      else value = n;
    } else {
      const c = parseMoneyInput(amount);
      if (!amount.trim()) f.value = t("promos.errors.value");
      else if (c == null || c < 1) f.value = t("promos.errors.amount");
      else value = c;
    }
    let minSubtotalCents = 0;
    if (minSpend.trim()) {
      const c = parseMoneyInput(minSpend);
      if (c == null) f.minSubtotalCents = t("promos.errors.minSpend");
      else minSubtotalCents = c;
    }
    if (scope === "some" && serviceIds.length === 0) f.serviceIds = t("promos.errors.services");
    const max = maxUses.trim() ? Number(maxUses) : null;
    if (max != null && (!Number.isInteger(max) || max < 1)) f.maxRedemptions = t("promos.errors.maxUses");
    const per = Number(perClient);
    if (!Number.isInteger(per) || per < 1 || per > 100) f.perCustomerLimit = t("promos.errors.perClient");
    if (startsOn && endsOn && endsOn < startsOn) f.endsOn = t("promos.errors.endsOn");
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
      toast.success(promo ? t("promos.updated", { code: code.trim().toUpperCase() }) : t("promos.created", { code: code.trim().toUpperCase() }));
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
    return n && n > 0 ? discountLabel(t, intl, kind, n, currency) : null;
  })();

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={promo ? t("promos.editTitle", { code: promo.code }) : t("promos.newTitle")}
      description={promo && promo.redemptionCount > 0 ? t("promos.usedTimes", { count: promo.redemptionCount }) : t("promos.dialogDescription")}
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("dialogs.cancel")}
          </Button>
          <Button type="submit" form="promo-form" loading={saving}>
            {promo ? t("client.save") : t("promos.createCode")}
          </Button>
        </>
      }
    >
      <form id="promo-form" onSubmit={save} className="space-y-5" noValidate>
        <FormError message={error && !Object.keys(fields).length ? error : null} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("promos.fields.code")} hint={t("promos.fields.codeHint")} error={fields.code}>
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                maxLength={24}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="SPRING20"
                className="font-mono uppercase tracking-wide"
              />
            )}
          </Field>
          <Field label={t("newAppt.name")} hint={t("promos.fields.nameHint")} error={fields.name}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t("promos.fields.namePlaceholder")} />}
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">{t("promos.fields.discount")}</legend>
          <div className="flex flex-wrap items-start gap-3">
            <Segmented
              label={t("promos.fields.discountType")}
              value={kind}
              onChange={(k) => {
                setKind(k);
                setAmount("");
              }}
              options={[
                { value: "percent", label: t("promos.fields.percent") },
                { value: "fixed", label: t("promos.fields.amount") },
              ]}
            />
            <div className="relative w-36">
              {kind === "fixed" && <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">{currency === "USD" ? "$" : currency}</span>}
              <Input
                aria-label={kind === "percent" ? t("promos.fields.percentOff") : t("promos.fields.amountOff")}
                aria-invalid={fields.value ? true : undefined}
                aria-describedby={fields.value ? "promo-value-error" : undefined}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn("tabular", kind === "fixed" ? "ps-7" : "pe-8")}
                placeholder={kind === "percent" ? "15" : "10"}
              />
              {kind === "percent" && <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">%</span>}
            </div>
            {preview && !fields.value && (
              <p className="self-center text-sm text-ink-3" aria-live="polite">
                {t("promos.fields.preview", { discount: preview })}
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
          <legend className="text-sm font-medium text-ink">{t("promos.fields.appliesTo")}</legend>
          <Segmented
            label={t("nav.services")}
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: t("promos.allServices") },
              { value: "some", label: t("promos.fields.specific") },
            ]}
          />
          {scope === "some" && (
            <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-line px-3 py-1.5">
              {services.length === 0 ? (
                <p className="py-2 text-sm text-ink-3">{t("promos.fields.noServices")}</p>
              ) : (
                services.map((s) => (
                  <Checkbox
                    key={s.id}
                    checked={serviceIds.includes(s.id)}
                    onCheckedChange={(on) => setServiceIds((ids) => (on ? [...ids, s.id] : ids.filter((x) => x !== s.id)))}
                    label={s.name}
                    description={s.status === "hidden" ? t("promos.fields.hidden") : undefined}
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
          <Field label={t("block.firstDay")} optional hint={t("promos.fields.firstDayHint")} error={fields.startsOn}>
            {(p) => <Input {...p} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}
          </Field>
          <Field label={t("block.lastDay")} optional hint={t("promos.fields.lastDayHint")} error={fields.endsOn}>
            {(p) => <Input {...p} type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("promos.fields.totalUses")} optional hint={t("promos.fields.totalUsesHint")} error={fields.maxRedemptions}>
            {(p) => <Input {...p} inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder={t("promos.fields.noLimit")} className="tabular" />}
          </Field>
          <Field label={t("promos.fields.perClient")} error={fields.perCustomerLimit}>
            {(p) => <Input {...p} inputMode="numeric" value={perClient} onChange={(e) => setPerClient(e.target.value.replace(/\D/g, ""))} className="tabular" />}
          </Field>
          <Field label={t("promos.fields.minSpend")} optional hint={t("promos.fields.minSpendHint")} error={fields.minSubtotalCents}>
            {(p) => <Input {...p} inputMode="decimal" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} placeholder={t("promos.fields.none")} className="tabular" />}
          </Field>
        </div>

        <div className="rounded-md border border-line px-3 py-2">
          <Switch checked={newOnly} onCheckedChange={setNewOnly} label={t("promos.newOnly")} description={t("promos.fields.newOnlyHint")} />
        </div>
      </form>
    </Dialog>
  );
}
