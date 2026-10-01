"use client";

import { ArrowDown, ArrowUp, Camera, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceCard, Segmented, Switch } from "@/components/ui/controls";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar, MediaImage, type MediaLike } from "@/components/ui/media";
import { formatDuration, formatMoney, formatPriceLabel, parseMoneyInput } from "@/domain/money";
import { DURATION_CHOICES } from "@/domain/service-templates";
import { useLocale, useT } from "@/i18n/client";
import { priceWords } from "@/i18n/helpers";
import { rich } from "@/i18n/rich";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { uploadMedia } from "@/lib/upload";

type Option = { id?: string; key: string; name: string; description: string; price: string; duration: number; isDefault: boolean; isActive: boolean; eligibleMemberIds: string[] | null };
type Group = { id?: string; key: string; name: string; description: string; selection: "single" | "multiple"; required: boolean; maxSelect: number | null; options: Option[] };

export type EditorInput = {
  name: string;
  description: string | null;
  categoryId: string | null;
  menuSection: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceType: "fixed" | "starting_at" | "range" | "free" | "quote";
  priceCents: number;
  salePriceCents: number | null;
  priceMaxCents: number | null;
  paymentPolicy: "pay_later" | "deposit" | "full";
  depositType: "fixed" | "percent" | null;
  depositValue: number | null;
  capacity: number;
  minAttendees: number;
  minNoticeMinutes: number | null;
  maxAdvanceDays: number | null;
  requiresApproval: boolean | null;
  intakeFormId: string | null;
  consentText: string | null;
  minAge: number | null;
  bookingInstructions: string | null;
  coverMediaId: string | null;
  status: "active" | "hidden";
  memberIds: string[];
  staffOverrides: { memberId: string; priceCents: number | null; durationMinutes: number | null }[];
  locationIds: string[];
  optionGroups: {
    id?: string;
    name: string;
    description: string | null;
    selection: "single" | "multiple";
    required: boolean;
    maxSelect: number | null;
    options: { id?: string; name: string; description: string | null; priceDeltaCents: number; durationDeltaMinutes: number; eligibleMemberIds: string[] | null; isDefault: boolean; isActive: boolean }[];
  }[];
};

type Ctx = {
  businessId: string;
  currency: string;
  paymentsEnabled: boolean;
  team: { id: string; name: string }[];
  locations: { id: string; name: string; kind: string }[];
  categories: { id: string; name: string; children: { id: string; name: string }[] }[];
  forms: { id: string; name: string }[];
  sections: string[];
  businessBookingMode: "instant" | "request";
  plan: { intakeForms: boolean };
};

const SECTIONS = ["basics", "price", "options", "who", "rules", "questions", "photo"] as const;
const NOTICE_CHOICES = [0, 60, 240, 1440, 2880, 10080];

const money = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2).replace(/\.00$/, ""));
let keySeq = 0;
const k = () => `new${++keySeq}`;

/** Keys for server-rendered rows must be deterministic (hydration); new rows use the counter. */
function toGroups(input: EditorInput): Group[] {
  return input.optionGroups.map((g, gi) => ({
    id: g.id,
    key: g.id ?? `g${gi}`,
    name: g.name,
    description: g.description ?? "",
    selection: g.selection,
    required: g.required,
    maxSelect: g.maxSelect,
    options: g.options.map((o, oi) => ({ id: o.id, key: o.id ?? `g${gi}o${oi}`, name: o.name, description: o.description ?? "", price: money(o.priceDeltaCents), duration: o.durationDeltaMinutes, isDefault: o.isDefault, isActive: o.isActive, eligibleMemberIds: o.eligibleMemberIds })),
  }));
}

/**
 * Service editor. Progressive: the essentials are always visible; advanced
 * rules sit in clearly labelled sections with sensible defaults. A live card
 * shows exactly what customers will see.
 */
export function ServiceEditor({ initial, serviceId, ctx, cover: initialCover }: { initial: EditorInput; serviceId: string | null; ctx: Ctx; cover: MediaLike | null }) {
  const t = useT("proSetup");
  const tr = useT();
  const { intl } = useLocale();
  const router = useRouter();
  const noticeLabel = (m: number) => (m === 0 ? t("editor.none") : m < 1440 ? t("editor.notice.hours", { count: m / 60 }) : m < 10080 ? t("editor.notice.days", { count: m / 1440 }) : t("editor.notice.weeks", { count: m / 10080 }));
  const [v, setV] = useState(initial);
  const [price, setPrice] = useState(serviceId || initial.priceCents ? money(initial.priceCents) : "");
  const [sale, setSale] = useState(money(initial.salePriceCents));
  const [priceMax, setPriceMax] = useState(money(initial.priceMaxCents));
  const [deposit, setDeposit] = useState(initial.depositType === "fixed" ? money(initial.depositValue) : String(initial.depositValue ?? ""));
  const [groups, setGroups] = useState<Group[]>(() => toGroups(initial));
  const [cover, setCover] = useState<MediaLike | null>(initialCover);
  const [uploading, setUploading] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof EditorInput>(key: K, value: EditorInput[K]) => {
    setV((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const priced = v.priceType !== "free" && v.priceType !== "quote";
  const totalOptionsMin = useMemo(() => groups.reduce((s, g) => s + Math.min(0, ...g.options.map((o) => o.duration)), 0), [groups]);

  function buildPayload(): EditorInput | null {
    const errs: Record<string, string> = {};
    const priceCents = priced ? parseMoneyInput(price) : 0;
    if (priced && priceCents == null) errs.priceCents = t("editor.errors.price");
    const saleCents = sale.trim() ? parseMoneyInput(sale) : null;
    if (sale.trim() && saleCents == null) errs.salePriceCents = t("editor.errors.validAmount");
    const maxCents = v.priceType === "range" ? parseMoneyInput(priceMax) : null;
    if (v.priceType === "range" && (maxCents == null || priceCents == null || maxCents <= priceCents)) errs.priceMaxCents = t("editor.errors.rangeMax");
    let depositValue: number | null = null;
    if (v.paymentPolicy === "deposit") {
      depositValue = v.depositType === "percent" ? Number(deposit) : parseMoneyInput(deposit);
      if (!depositValue || depositValue <= 0 || (v.depositType === "percent" && depositValue > 100)) errs.depositValue = v.depositType === "percent" ? t("editor.errors.percent") : t("editor.errors.amount");
    }
    if (v.name.trim().length < 2) errs.name = t("editor.errors.name");
    if (v.memberIds.length === 0) errs.memberIds = t("editor.errors.members");
    const optionGroups: EditorInput["optionGroups"] = [];
    groups.forEach((g, gi) => {
      if (!g.name.trim()) errs[`group.${gi}`] = t("editor.errors.groupName");
      if (g.options.length === 0) errs[`group.${gi}`] = t("editor.errors.groupEmpty");
      const options = g.options.map((o, oi) => {
        const cents = o.price.trim() === "" ? 0 : parseMoneyInput(o.price.replace(/^\+/, ""));
        if (!o.name.trim()) errs[`opt.${gi}.${oi}`] = t("editor.errors.choiceName");
        if (cents == null) errs[`opt.${gi}.${oi}`] = t("editor.errors.choicePrice");
        return { id: o.id, name: o.name.trim(), description: o.description.trim() || null, priceDeltaCents: cents ?? 0, durationDeltaMinutes: o.duration, eligibleMemberIds: o.eligibleMemberIds, isDefault: o.isDefault, isActive: o.isActive };
      });
      optionGroups.push({ id: g.id, name: g.name.trim(), description: g.description.trim() || null, selection: g.selection, required: g.required, maxSelect: g.selection === "multiple" ? g.maxSelect : null, options });
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError(t("editor.errors.form"));
      document.querySelector("[aria-invalid=true], [data-error=true]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return null;
    }
    return {
      ...v,
      name: v.name.trim(),
      priceCents: priceCents ?? 0,
      salePriceCents: v.priceType === "fixed" || v.priceType === "starting_at" ? saleCents : null,
      priceMaxCents: maxCents,
      depositValue,
      depositType: v.paymentPolicy === "deposit" ? v.depositType ?? "fixed" : null,
      optionGroups,
    };
  }

  async function save() {
    setFormError(null);
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      const res = await api<{ id: string }>(serviceId ? `/api/pro/services/${serviceId}` : "/api/pro/services", { method: serviceId ? "PUT" : "POST", body: payload });
      setDirty(false);
      toast.success(serviceId ? t("editor.saved") : t("editor.created"));
      if (!serviceId) router.replace(`/pro/services/${res.id}`);
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      setErrors(e.fields ?? {});
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function onCover(file?: File) {
    if (!file) return;
    setUploading(0);
    try {
      const res = await uploadMedia(file, { purpose: "service", businessId: ctx.businessId, onProgress: setUploading });
      setCover(res.media);
      set("coverMediaId", res.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(null);
    }
  }

  /* ── Groups helpers ── */
  const updateGroup = (key: string, patch: Partial<Group>) => {
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
    setDirty(true);
  };
  const updateOption = (gk: string, ok: string, patch: Partial<Option>) => {
    setGroups((gs) => gs.map((g) => (g.key === gk ? { ...g, options: g.options.map((o) => (o.key === ok ? { ...o, ...patch } : o)) } : g)));
    setDirty(true);
  };
  const addGroup = (preset?: "variant" | "addon") => {
    setGroups((gs) => [
      ...gs,
      preset === "addon"
        ? { key: k(), name: t("editor.addonsName"), description: "", selection: "multiple", required: false, maxSelect: null, options: [{ key: k(), name: "", description: "", price: "", duration: 0, isDefault: false, isActive: true, eligibleMemberIds: null }] }
        : { key: k(), name: "", description: "", selection: "single", required: true, maxSelect: null, options: [{ key: k(), name: "", description: "", price: "", duration: 0, isDefault: true, isActive: true, eligibleMemberIds: null }, { key: k(), name: "", description: "", price: "", duration: 0, isDefault: false, isActive: true, eligibleMemberIds: null }] },
    ]);
    setDirty(true);
  };

  const previewPrice = formatPriceLabel({ priceType: v.priceType, priceCents: parseMoneyInput(price) ?? 0, salePriceCents: sale.trim() ? parseMoneyInput(sale) : null, priceMaxCents: parseMoneyInput(priceMax) }, ctx.currency, { intl, words: priceWords(tr) });

  return (
    <div className="pb-28">
      <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)_300px]">
        <nav aria-label={t("editor.sectionsNav")} className="hidden lg:block">
          <ul className="sticky top-8 space-y-0.5 text-sm">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                  {t(`editor.nav.${id}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-12">
          <FormError message={formError} />

          <Section id="basics" title={t("editor.basics.title")}>
            <Field label={t("editor.basics.name")} error={errors.name}>
              {(p) => <Input {...p} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={100} placeholder={t("editor.basics.namePlaceholder")} />}
            </Field>
            <Field label={t("editor.basics.description")} optional hint={t("editor.basics.descriptionHint")}>
              {(p) => <Textarea {...p} rows={3} value={v.description ?? ""} onChange={(e) => set("description", e.target.value || null)} maxLength={3000} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("editor.basics.menuSection")} optional hint={t("editor.basics.menuSectionHint")}>
                {(p) => (
                  <>
                    <Input {...p} list="menu-sections" value={v.menuSection ?? ""} onChange={(e) => set("menuSection", e.target.value || null)} maxLength={60} />
                    <datalist id="menu-sections">
                      {ctx.sections.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
              <Field label={t("editor.basics.category")} optional hint={t("editor.basics.categoryHint")}>
                {(p) => (
                  <Select {...p} value={v.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)}>
                    <option value="">{t("editor.basics.sameAsBusiness")}</option>
                    {ctx.categories.map((c) => (
                      <optgroup key={c.id} label={c.name}>
                        <option value={c.id}>{c.name}</option>
                        {c.children.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section id="price" title={t("editor.price.title")}>
            <Segmented
              label={t("editor.price.pricing")}
              value={v.priceType}
              onChange={(pt) => set("priceType", pt)}
              options={(["fixed", "starting_at", "range", "free", "quote"] as const).map((pt) => ({ value: pt, label: t(`editor.price.type.${pt}`) }))}
            />
            <p className="-mt-2 text-[13px] text-ink-3">
              {t(`editor.price.typeHint.${v.priceType}`)}
            </p>
            {priced && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={v.priceType === "range" ? t("editor.price.from", { currency: ctx.currency }) : t("editor.price.price", { currency: ctx.currency })} error={errors.priceCents}>
                  {(p) => <Input {...p} inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setDirty(true); }} placeholder="0.00" />}
                </Field>
                {v.priceType === "range" ? (
                  <Field label={t("editor.price.to", { currency: ctx.currency })} error={errors.priceMaxCents}>
                    {(p) => <Input {...p} inputMode="decimal" value={priceMax} onChange={(e) => { setPriceMax(e.target.value); setDirty(true); }} />}
                  </Field>
                ) : (
                  <Field label={t("editor.price.sale")} optional error={errors.salePriceCents} hint={t("editor.price.saleHint")}>
                    {(p) => <Input {...p} inputMode="decimal" value={sale} onChange={(e) => { setSale(e.target.value); setDirty(true); }} />}
                  </Field>
                )}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("editor.price.duration")}>
                {(p) => (
                  <Select {...p} value={v.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))}>
                    {[...new Set([...DURATION_CHOICES, v.durationMinutes])].sort((a, b) => a - b).map((d) => (
                      <option key={d} value={d}>
                        {formatDuration(d, intl)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("editor.price.prepBefore")} optional hint={t("editor.price.prepBeforeHint")}>
                {(p) => (
                  <Select {...p} value={v.bufferBeforeMinutes} onChange={(e) => set("bufferBeforeMinutes", Number(e.target.value))}>
                    {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>
                        {m ? formatDuration(m, intl) : t("editor.none")}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("editor.price.cleanupAfter")} optional hint={t("editor.price.cleanupAfterHint")}>
                {(p) => (
                  <Select {...p} value={v.bufferAfterMinutes} onChange={(e) => set("bufferAfterMinutes", Number(e.target.value))}>
                    {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>
                        {m ? formatDuration(m, intl) : t("editor.none")}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section id="options" title={t("editor.options.title")} lead={t("editor.options.lead")}>
            {groups.length === 0 && <p className="rounded-lg border border-dashed border-line-strong px-5 py-6 text-center text-sm text-ink-3">{t("editor.options.empty")}</p>}
            <div className="space-y-5">
              {groups.map((g, gi) => (
                <div key={g.key} className="rounded-xl border border-line bg-surface" data-error={errors[`group.${gi}`] ? true : undefined}>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-3 border-b border-line p-4 sm:grid-cols-[1fr_auto_auto]">
                    <Field label={t("editor.options.groupName")} className="col-span-2 sm:col-span-1" error={errors[`group.${gi}`]}>
                      {(p) => <Input {...p} value={g.name} onChange={(e) => updateGroup(g.key, { name: e.target.value })} placeholder={t("editor.options.groupNamePlaceholder")} maxLength={80} />}
                    </Field>
                    <Field label={t("editor.options.customersChoose")}>
                      {(p) => (
                        <Select {...p} value={g.selection} onChange={(e) => updateGroup(g.key, { selection: e.target.value as Group["selection"], required: e.target.value === "single" ? g.required : false })}>
                          <option value="single">{t("editor.options.one")}</option>
                          <option value="multiple">{t("editor.options.anyNumber")}</option>
                        </Select>
                      )}
                    </Field>
                    <div className="flex items-center gap-0.5 pb-1">
                      <button type="button" disabled={gi === 0} onClick={() => setGroups((gs) => { const n = [...gs]; [n[gi - 1], n[gi]] = [n[gi], n[gi - 1]]; return n; })} className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label={t("editor.options.moveGroupUp")}>
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" disabled={gi === groups.length - 1} onClick={() => setGroups((gs) => { const n = [...gs]; [n[gi + 1], n[gi]] = [n[gi], n[gi + 1]]; return n; })} className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label={t("editor.options.moveGroupDown")}>
                        <ArrowDown className="size-4" />
                      </button>
                      <button type="button" onClick={() => { setGroups((gs) => gs.filter((x) => x.key !== g.key)); setDirty(true); }} className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-danger-soft hover:text-danger" aria-label={g.name ? t("editor.options.remove", { name: g.name }) : t("editor.options.removeGroup")}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      {g.selection === "single" ? (
                        <Checkbox checked={g.required} onCheckedChange={(r) => updateGroup(g.key, { required: r })} label={t("editor.options.mustChooseOne")} />
                      ) : (
                        <label className="flex items-center gap-2 text-sm text-ink-2">
                          {t("editor.options.limitTo")}
                          <select value={g.maxSelect ?? ""} onChange={(e) => updateGroup(g.key, { maxSelect: e.target.value ? Number(e.target.value) : null })} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm">
                            <option value="">{t("editor.options.noLimit")}</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                  <ul className="divide-y divide-line">
                    {g.options.map((o, oi) => (
                      <li key={o.key} className="p-4" data-error={errors[`opt.${gi}.${oi}`] ? true : undefined}>
                        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 sm:grid-cols-[1fr_110px_120px_auto]">
                          <Field label={t("editor.options.choice")} className="col-span-3 sm:col-span-1" error={errors[`opt.${gi}.${oi}`]}>
                            {(p) => <Input {...p} value={o.name} onChange={(e) => updateOption(g.key, o.key, { name: e.target.value })} placeholder={g.selection === "single" ? t("editor.options.choicePlaceholderSingle") : t("editor.options.choicePlaceholderMultiple")} maxLength={80} />}
                          </Field>
                          <Field label={t("editor.options.addsPrice")}>
                            {(p) => <Input {...p} inputMode="decimal" value={o.price} onChange={(e) => updateOption(g.key, o.key, { price: e.target.value })} placeholder="0" />}
                          </Field>
                          <Field label={t("editor.options.addsTime")}>
                            {(p) => (
                              <Select {...p} value={o.duration} onChange={(e) => updateOption(g.key, o.key, { duration: Number(e.target.value) })}>
                                {[-30, -15, 0, 5, 10, 15, 20, 30, 45, 60, 90, 120].map((d) => (
                                  <option key={d} value={d}>
                                    {d === 0 ? t("editor.options.noChange") : `${d > 0 ? "+" : "−"}${formatDuration(Math.abs(d), intl)}`}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                          <button type="button" onClick={() => updateGroup(g.key, { options: g.options.filter((x) => x.key !== o.key) })} className="flex size-11 items-center justify-center self-end rounded-md text-ink-3 hover:bg-surface-2 md:size-10" aria-label={o.name ? t("editor.options.remove", { name: o.name }) : t("editor.options.removeChoice")}>
                            <X className="size-4" />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                          {g.selection === "single" && (
                            <label className="flex items-center gap-1.5 text-[13px] text-ink-3">
                              <input type="radio" name={`default-${g.key}`} checked={o.isDefault} onChange={() => updateGroup(g.key, { options: g.options.map((x) => ({ ...x, isDefault: x.key === o.key })) })} className="accent-[var(--accent)]" />
                              {t("editor.options.preselected")}
                            </label>
                          )}
                          {ctx.team.length > 1 && (
                            <details className="text-[13px] text-ink-3">
                              <summary className="cursor-pointer">{o.eligibleMemberIds ? t("editor.options.onlySome", { count: o.eligibleMemberIds.length, total: v.memberIds.length }) : t("editor.options.everyone")}</summary>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {ctx.team
                                  .filter((tm) => v.memberIds.includes(tm.id))
                                  .map((tm) => {
                                    const on = !o.eligibleMemberIds || o.eligibleMemberIds.includes(tm.id);
                                    return (
                                      <button
                                        key={tm.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => {
                                          const cur = o.eligibleMemberIds ?? v.memberIds;
                                          const next = on ? cur.filter((x) => x !== tm.id) : [...cur, tm.id];
                                          updateOption(g.key, o.key, { eligibleMemberIds: next.length === v.memberIds.length ? null : next });
                                        }}
                                        className={cn("h-7 rounded-md border px-2.5", on ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2")}
                                      >
                                        {tm.name}
                                      </button>
                                    );
                                  })}
                              </div>
                            </details>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-line px-4 py-3">
                    <button type="button" onClick={() => updateGroup(g.key, { options: [...g.options, { key: k(), name: "", description: "", price: "", duration: 0, isDefault: false, isActive: true, eligibleMemberIds: null }] })} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:underline">
                      <Plus className="size-4" /> {t("editor.options.addChoice")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => addGroup("variant")} icon={<Plus className="size-4" />}>
                {t("editor.options.addVariation")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => addGroup("addon")} icon={<Plus className="size-4" />}>
                {t("editor.options.addAddons")}
              </Button>
            </div>
            {totalOptionsMin < 0 && <p className="text-[13px] text-ink-3">{t("editor.options.shortenNote")}</p>}
          </Section>

          <Section id="who" title={t("editor.who.title")}>
            <Field label={t("editor.who.performedBy")} error={errors.memberIds}>
              {() => (
                <div className="grid gap-2 sm:grid-cols-2" data-error={errors.memberIds ? true : undefined}>
                  {ctx.team.map((tm) => {
                    const on = v.memberIds.includes(tm.id);
                    const ov = v.staffOverrides.find((o) => o.memberId === tm.id);
                    return (
                      <div key={tm.id} className={cn("rounded-lg border p-3", on ? "border-ink" : "border-line")}>
                        <Checkbox checked={on} onCheckedChange={(c) => set("memberIds", c ? [...v.memberIds, tm.id] : v.memberIds.filter((x) => x !== tm.id))} label={<span className="flex items-center gap-2"><Avatar name={tm.name} size={22} />{tm.name}</span>} />
                        {on && ctx.team.length > 1 && priced && (
                          <label className="mt-2 flex items-center gap-2 ps-8 text-[13px] text-ink-3">
                            {t("editor.who.theirPrice")}
                            <input
                              inputMode="decimal"
                              value={ov?.priceCents != null ? money(ov.priceCents) : ""}
                              placeholder={t("editor.who.standard")}
                              onChange={(e) => {
                                const cents = e.target.value ? parseMoneyInput(e.target.value) : null;
                                const rest = v.staffOverrides.filter((o) => o.memberId !== tm.id);
                                set("staffOverrides", cents == null && !ov?.durationMinutes ? rest : [...rest, { memberId: tm.id, priceCents: cents, durationMinutes: ov?.durationMinutes ?? null }]);
                              }}
                              className="h-8 w-24 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
                              aria-label={t("editor.who.priceFor", { name: tm.name })}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Field>
            {ctx.locations.length > 1 && (
              <Field label={t("editor.who.offeredAt")} hint={t("editor.who.offeredAtHint")}>
                {() => (
                  <div className="space-y-1">
                    {ctx.locations.map((l) => (
                      <Checkbox key={l.id} checked={v.locationIds.includes(l.id)} onCheckedChange={(c) => set("locationIds", c ? [...v.locationIds, l.id] : v.locationIds.filter((x) => x !== l.id))} label={l.name} description={l.kind === "mobile" ? t("editor.who.mobile") : l.kind === "virtual" ? t("editor.who.online") : undefined} />
                    ))}
                  </div>
                )}
              </Field>
            )}
            <Field label={t("editor.who.groupBookings")} hint={t("editor.who.groupBookingsHint")}>
              {(p) => (
                <Select {...p} value={v.capacity} onChange={(e) => { const c = Number(e.target.value); setV((s) => ({ ...s, capacity: c, minAttendees: Math.min(s.minAttendees, c) })); setDirty(true); }}>
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? t("editor.who.oneAtATime") : t("editor.who.upTo", { count: n })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Section>

          <Section id="rules" title={t("editor.rules.title")}>
            <Field label={t("editor.rules.confirmation")}>
              {() => (
                <div className="grid gap-2">
                  <ChoiceCard selected={v.requiresApproval == null} onClick={() => set("requiresApproval", null)} title={ctx.businessBookingMode === "instant" ? t("editor.rules.defaultInstant") : t("editor.rules.defaultRequest")} />
                  <ChoiceCard selected={v.requiresApproval === false} onClick={() => set("requiresApproval", false)} title={t("editor.rules.instant")} />
                  <ChoiceCard selected={v.requiresApproval === true} onClick={() => set("requiresApproval", true)} title={t("editor.rules.approve")} description={t("editor.rules.approveHint")} />
                </div>
              )}
            </Field>
            {priced && (
              <Field label={t("editor.rules.payment")} hint={!ctx.paymentsEnabled ? t("editor.rules.paymentsOff") : undefined}>
                {() => (
                  <div className="space-y-3">
                    <Segmented
                      label={t("editor.rules.payment")}
                      value={v.paymentPolicy}
                      onChange={(pp) => {
                        setV((s) => ({ ...s, paymentPolicy: pp, depositType: pp === "deposit" ? (s.depositType ?? "fixed") : s.depositType }));
                        setDirty(true);
                      }}
                      options={[
                        { value: "pay_later", label: t("editor.rules.payLater") },
                        { value: "deposit", label: t("editor.rules.deposit") },
                        { value: "full", label: t("editor.rules.payFull") },
                      ]}
                    />
                    {v.paymentPolicy === "deposit" && (
                      <div className="flex items-end gap-3">
                        <Field label={t("editor.rules.deposit")} error={errors.depositValue}>
                          {(p) => <Input {...p} inputMode="decimal" value={deposit} onChange={(e) => { setDeposit(e.target.value); setDirty(true); }} className="w-28" />}
                        </Field>
                        <Segmented label={t("editor.rules.depositType")} size="sm" value={v.depositType ?? "fixed"} onChange={(dt) => set("depositType", dt)} options={[{ value: "fixed", label: ctx.currency }, { value: "percent", label: "%" }]} />
                      </div>
                    )}
                  </div>
                )}
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("editor.rules.minNotice")} hint={t("editor.rules.minNoticeHint")}>
                {(p) => (
                  <Select {...p} value={v.minNoticeMinutes ?? ""} onChange={(e) => set("minNoticeMinutes", e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">{t("editor.rules.businessDefault")}</option>
                    {NOTICE_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {noticeLabel(m)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("editor.rules.bookUpTo")}>
                {(p) => (
                  <Select {...p} value={v.maxAdvanceDays ?? ""} onChange={(e) => set("maxAdvanceDays", e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">{t("editor.rules.businessDefault")}</option>
                    {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                      <option key={d} value={d}>
                        {t("editor.rules.daysAhead", { count: d })}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section id="questions" title={t("editor.questions.title")} lead={t("editor.questions.lead")}>
            {ctx.forms.length > 0 ? (
              <Field label={t("editor.questions.intake")}>
                {(p) => (
                  <Select {...p} value={v.intakeFormId ?? ""} onChange={(e) => set("intakeFormId", e.target.value || null)}>
                    <option value="">{t("editor.none")}</option>
                    {ctx.forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <p className="text-sm text-ink-3">
                {rich(t("editor.questions.createForms"), {
                  link: (c) => (
                    <Link href="/pro/settings/forms" className="font-medium text-ink underline underline-offset-2">
                      {c}
                    </Link>
                  ),
                })}
              </p>
            )}
            <Field label={t("editor.questions.instructions")} optional hint={t("editor.questions.instructionsHint")}>
              {(p) => <Textarea {...p} rows={2} value={v.bookingInstructions ?? ""} onChange={(e) => set("bookingInstructions", e.target.value || null)} maxLength={2000} />}
            </Field>
            <Field label={t("editor.questions.consent")} optional hint={t("editor.questions.consentHint")}>
              {(p) => <Textarea {...p} rows={3} value={v.consentText ?? ""} onChange={(e) => set("consentText", e.target.value || null)} maxLength={3000} />}
            </Field>
            <Field label={t("editor.questions.minAge")} optional>
              {(p) => (
                <Select {...p} value={v.minAge ?? ""} onChange={(e) => set("minAge", e.target.value ? Number(e.target.value) : null)} className="w-48">
                  <option value="">{t("editor.questions.noRequirement")}</option>
                  {[13, 16, 18, 21].map((a) => (
                    <option key={a} value={a}>
                      {a}+
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Section>

          <Section id="photo" title={t("editor.photo.title")}>
            <div className="flex items-start gap-5">
              <div className="relative aspect-[4/3] w-44 overflow-hidden rounded-lg border border-line bg-surface-2">
                {cover ? <MediaImage media={cover} sizes="176px" className="size-full" /> : <span className="flex size-full items-center justify-center text-[13px] text-ink-3">{t("editor.photo.none")}</span>}
                {uploading != null && <span className="absolute inset-0 flex items-center justify-center bg-ink/60 text-sm font-semibold text-white tabular">{uploading}%</span>}
              </div>
              <div className="space-y-2">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2">
                  <Camera className="size-4" /> {cover ? t("editor.photo.replace") : t("editor.photo.upload")}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onCover(e.target.files?.[0])} />
                </label>
                {cover && (
                  <button type="button" className="block text-sm text-ink-3 hover:text-danger" onClick={() => { setCover(null); set("coverMediaId", null); }}>
                    {t("editor.photo.remove")}
                  </button>
                )}
                <p className="max-w-xs text-[13px] text-ink-3">{t("editor.photo.hint")}</p>
              </div>
            </div>
          </Section>
        </div>

        <aside className="hidden lg:block" aria-label={t("editor.preview.label")}>
          <div className="sticky top-8 space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("editor.preview.title")}</p>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {cover && <MediaImage media={cover} sizes="300px" className="aspect-[16/10] w-full" />}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-semibold text-ink">{v.name || t("editor.basics.name")}</p>
                  <p className="shrink-0 text-[15px] font-semibold text-ink tabular">{previewPrice}</p>
                </div>
                {v.description && <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-3">{v.description}</p>}
                <p className="mt-2 text-[12px] text-ink-3">
                  {formatDuration(v.durationMinutes, intl)}
                  {groups.length > 0 && ` · ${t("editor.preview.optionsAvailable")}`}
                  {v.capacity > 1 && ` · ${t("editor.who.upTo", { count: v.capacity })}`}
                </p>
                {groups.slice(0, 2).map((g) => (
                  <div key={g.key} className="mt-3">
                    <p className="text-[12px] font-medium text-ink-2">{g.name || t("editor.preview.options")}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.options.slice(0, 4).map((o) => (
                        <span key={o.key} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2">
                          {o.name || "…"}
                          {o.price && parseMoneyInput(o.price) ? ` +${formatMoney(parseMoneyInput(o.price)!, ctx.currency, { compact: true, intl })}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="mt-4 flex h-9 items-center justify-center rounded-md bg-ink text-sm font-medium text-bg">{v.requiresApproval ?? ctx.businessBookingMode === "request" ? t("editor.preview.request") : t("editor.preview.book")}</div>
              </div>
            </div>
            <Switch checked={v.status === "active"} onCheckedChange={(on) => set("status", on ? "active" : "hidden")} label={t("editor.visible")} description={v.status === "active" ? t("editor.visibleOn") : t("editor.visibleOff")} />
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:bottom-0 lg:start-[248px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <p className="text-sm text-ink-3" aria-live="polite">
            {saving ? t("editor.saving") : dirty ? t("editor.unsaved") : serviceId ? t("editor.allSaved") : t("services.new")}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push("/pro/services")} disabled={saving}>
              {dirty ? t("editor.discard") : t("editor.back")}
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty && Boolean(serviceId)}>
              {serviceId ? t("editor.save") : t("editor.create")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-8 space-y-5">
      <div>
        <h2 id={`${id}-h`} className="text-lg font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {lead && <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-3">{lead}</p>}
      </div>
      {children}
    </section>
  );
}
