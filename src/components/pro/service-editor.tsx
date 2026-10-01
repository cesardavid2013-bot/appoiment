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

const SECTIONS = [
  ["basics", "Basics"],
  ["price", "Price & time"],
  ["options", "Options & add-ons"],
  ["who", "Who & where"],
  ["rules", "Booking rules"],
  ["questions", "Questions"],
  ["photo", "Photo"],
] as const;

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
  const router = useRouter();
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
    if (priced && priceCents == null) errs.priceCents = "Enter a price";
    const saleCents = sale.trim() ? parseMoneyInput(sale) : null;
    if (sale.trim() && saleCents == null) errs.salePriceCents = "Enter a valid amount";
    const maxCents = v.priceType === "range" ? parseMoneyInput(priceMax) : null;
    if (v.priceType === "range" && (maxCents == null || priceCents == null || maxCents <= priceCents)) errs.priceMaxCents = "Must be higher than the starting price";
    let depositValue: number | null = null;
    if (v.paymentPolicy === "deposit") {
      depositValue = v.depositType === "percent" ? Number(deposit) : parseMoneyInput(deposit);
      if (!depositValue || depositValue <= 0 || (v.depositType === "percent" && depositValue > 100)) errs.depositValue = v.depositType === "percent" ? "Enter 1–100" : "Enter an amount";
    }
    if (v.name.trim().length < 2) errs.name = "Name your service";
    if (v.memberIds.length === 0) errs.memberIds = "Choose at least one person";
    const optionGroups: EditorInput["optionGroups"] = [];
    groups.forEach((g, gi) => {
      if (!g.name.trim()) errs[`group.${gi}`] = "Name this group";
      if (g.options.length === 0) errs[`group.${gi}`] = "Add at least one choice";
      const options = g.options.map((o, oi) => {
        const cents = o.price.trim() === "" ? 0 : parseMoneyInput(o.price.replace(/^\+/, ""));
        if (!o.name.trim()) errs[`opt.${gi}.${oi}`] = "Name this choice";
        if (cents == null) errs[`opt.${gi}.${oi}`] = "Enter a valid price";
        return { id: o.id, name: o.name.trim(), description: o.description.trim() || null, priceDeltaCents: cents ?? 0, durationDeltaMinutes: o.duration, eligibleMemberIds: o.eligibleMemberIds, isDefault: o.isDefault, isActive: o.isActive };
      });
      optionGroups.push({ id: g.id, name: g.name.trim(), description: g.description.trim() || null, selection: g.selection, required: g.required, maxSelect: g.selection === "multiple" ? g.maxSelect : null, options });
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("A few things need your attention — they're highlighted below.");
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
      toast.success(serviceId ? "Changes saved" : "Service created");
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
        ? { key: k(), name: "Add-ons", description: "", selection: "multiple", required: false, maxSelect: null, options: [{ key: k(), name: "", description: "", price: "", duration: 0, isDefault: false, isActive: true, eligibleMemberIds: null }] }
        : { key: k(), name: "", description: "", selection: "single", required: true, maxSelect: null, options: [{ key: k(), name: "", description: "", price: "", duration: 0, isDefault: true, isActive: true, eligibleMemberIds: null }, { key: k(), name: "", description: "", price: "", duration: 0, isDefault: false, isActive: true, eligibleMemberIds: null }] },
    ]);
    setDirty(true);
  };

  const previewPrice = formatPriceLabel({ priceType: v.priceType, priceCents: parseMoneyInput(price) ?? 0, salePriceCents: sale.trim() ? parseMoneyInput(sale) : null, priceMaxCents: parseMoneyInput(priceMax) }, ctx.currency);

  return (
    <div className="pb-28">
      <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)_300px]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="sticky top-8 space-y-0.5 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-12">
          <FormError message={formError} />

          <Section id="basics" title="Basics">
            <Field label="Service name" error={errors.name}>
              {(p) => <Input {...p} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={100} placeholder="e.g. Skin fade, Gel extensions, 1:1 training" />}
            </Field>
            <Field label="Description" optional hint="What's included and what to expect. Shown on your profile.">
              {(p) => <Textarea {...p} rows={3} value={v.description ?? ""} onChange={(e) => set("description", e.target.value || null)} maxLength={3000} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Menu section" optional hint="Groups services on your profile, e.g. “Cuts”.">
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
              <Field label="Category" optional hint="Helps customers find it in search.">
                {(p) => (
                  <Select {...p} value={v.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)}>
                    <option value="">Same as business</option>
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

          <Section id="price" title="Price & time">
            <Segmented
              label="Pricing"
              value={v.priceType}
              onChange={(t) => set("priceType", t)}
              options={[
                { value: "fixed", label: "Fixed" },
                { value: "starting_at", label: "From" },
                { value: "range", label: "Range" },
                { value: "free", label: "Free" },
                { value: "quote", label: "Quote" },
              ]}
            />
            <p className="-mt-2 text-[13px] text-ink-3">
              {
                {
                  fixed: "Customers see one price.",
                  starting_at: "Shown as “From $X” — the final price depends on the work.",
                  range: "Shown as a range, e.g. $60–$90.",
                  free: "No charge — great for consultations.",
                  quote: "No price shown. You'll agree the price after talking with the customer.",
                }[v.priceType]
              }
            </p>
            {priced && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={v.priceType === "range" ? `From (${ctx.currency})` : `Price (${ctx.currency})`} error={errors.priceCents}>
                  {(p) => <Input {...p} inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setDirty(true); }} placeholder="0.00" />}
                </Field>
                {v.priceType === "range" ? (
                  <Field label={`To (${ctx.currency})`} error={errors.priceMaxCents}>
                    {(p) => <Input {...p} inputMode="decimal" value={priceMax} onChange={(e) => { setPriceMax(e.target.value); setDirty(true); }} />}
                  </Field>
                ) : (
                  <Field label="Sale price" optional error={errors.salePriceCents} hint="Shown with the original crossed out.">
                    {(p) => <Input {...p} inputMode="decimal" value={sale} onChange={(e) => { setSale(e.target.value); setDirty(true); }} />}
                  </Field>
                )}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Duration">
                {(p) => (
                  <Select {...p} value={v.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))}>
                    {[...new Set([...DURATION_CHOICES, v.durationMinutes])].sort((a, b) => a - b).map((d) => (
                      <option key={d} value={d}>
                        {formatDuration(d)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Prep before" optional hint="Blocked, not shown to customers.">
                {(p) => (
                  <Select {...p} value={v.bufferBeforeMinutes} onChange={(e) => set("bufferBeforeMinutes", Number(e.target.value))}>
                    {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>
                        {m ? `${m} min` : "None"}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Cleanup after" optional hint="Time before the next booking.">
                {(p) => (
                  <Select {...p} value={v.bufferAfterMinutes} onChange={(e) => set("bufferAfterMinutes", Number(e.target.value))}>
                    {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>
                        {m ? `${m} min` : "None"}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section id="options" title="Options & add-ons" lead="Let customers choose things like length, size, design or extras. Each choice can change the price and the time it takes.">
            {groups.length === 0 && <p className="rounded-lg border border-dashed border-line-strong px-5 py-6 text-center text-sm text-ink-3">No options — customers book the service as is.</p>}
            <div className="space-y-5">
              {groups.map((g, gi) => (
                <div key={g.key} className="rounded-xl border border-line bg-surface" data-error={errors[`group.${gi}`] ? true : undefined}>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-3 border-b border-line p-4 sm:grid-cols-[1fr_auto_auto]">
                    <Field label="Group name" className="col-span-2 sm:col-span-1" error={errors[`group.${gi}`]}>
                      {(p) => <Input {...p} value={g.name} onChange={(e) => updateGroup(g.key, { name: e.target.value })} placeholder="e.g. Length, Size, Add-ons" maxLength={80} />}
                    </Field>
                    <Field label="Customers choose">
                      {(p) => (
                        <Select {...p} value={g.selection} onChange={(e) => updateGroup(g.key, { selection: e.target.value as Group["selection"], required: e.target.value === "single" ? g.required : false })}>
                          <option value="single">One</option>
                          <option value="multiple">Any number</option>
                        </Select>
                      )}
                    </Field>
                    <div className="flex items-center gap-0.5 pb-1">
                      <button type="button" disabled={gi === 0} onClick={() => setGroups((gs) => { const n = [...gs]; [n[gi - 1], n[gi]] = [n[gi], n[gi - 1]]; return n; })} className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label="Move group up">
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" disabled={gi === groups.length - 1} onClick={() => setGroups((gs) => { const n = [...gs]; [n[gi + 1], n[gi]] = [n[gi], n[gi + 1]]; return n; })} className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label="Move group down">
                        <ArrowDown className="size-4" />
                      </button>
                      <button type="button" onClick={() => { setGroups((gs) => gs.filter((x) => x.key !== g.key)); setDirty(true); }} className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${g.name || "group"}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      {g.selection === "single" ? (
                        <Checkbox checked={g.required} onCheckedChange={(r) => updateGroup(g.key, { required: r })} label="Customers must choose one" />
                      ) : (
                        <label className="flex items-center gap-2 text-sm text-ink-2">
                          Limit to
                          <select value={g.maxSelect ?? ""} onChange={(e) => updateGroup(g.key, { maxSelect: e.target.value ? Number(e.target.value) : null })} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm">
                            <option value="">no limit</option>
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
                          <Field label="Choice" className="col-span-3 sm:col-span-1" error={errors[`opt.${gi}.${oi}`]}>
                            {(p) => <Input {...p} value={o.name} onChange={(e) => updateOption(g.key, o.key, { name: e.target.value })} placeholder={g.selection === "single" ? "e.g. Long" : "e.g. Beard trim"} maxLength={80} />}
                          </Field>
                          <Field label="Adds price">
                            {(p) => <Input {...p} inputMode="decimal" value={o.price} onChange={(e) => updateOption(g.key, o.key, { price: e.target.value })} placeholder="0" />}
                          </Field>
                          <Field label="Adds time">
                            {(p) => (
                              <Select {...p} value={o.duration} onChange={(e) => updateOption(g.key, o.key, { duration: Number(e.target.value) })}>
                                {[-30, -15, 0, 5, 10, 15, 20, 30, 45, 60, 90, 120].map((d) => (
                                  <option key={d} value={d}>
                                    {d === 0 ? "No change" : `${d > 0 ? "+" : "−"}${formatDuration(Math.abs(d))}`}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                          <button type="button" onClick={() => updateGroup(g.key, { options: g.options.filter((x) => x.key !== o.key) })} className="flex size-11 items-center justify-center self-end rounded-md text-ink-3 hover:bg-surface-2 md:size-10" aria-label={`Remove ${o.name || "choice"}`}>
                            <X className="size-4" />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                          {g.selection === "single" && (
                            <label className="flex items-center gap-1.5 text-[13px] text-ink-3">
                              <input type="radio" name={`default-${g.key}`} checked={o.isDefault} onChange={() => updateGroup(g.key, { options: g.options.map((x) => ({ ...x, isDefault: x.key === o.key })) })} className="accent-[var(--accent)]" />
                              Pre-selected
                            </label>
                          )}
                          {ctx.team.length > 1 && (
                            <details className="text-[13px] text-ink-3">
                              <summary className="cursor-pointer">{o.eligibleMemberIds ? `Only ${o.eligibleMemberIds.length} of ${v.memberIds.length} staff` : "Everyone can do this"}</summary>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {ctx.team
                                  .filter((t) => v.memberIds.includes(t.id))
                                  .map((t) => {
                                    const on = !o.eligibleMemberIds || o.eligibleMemberIds.includes(t.id);
                                    return (
                                      <button
                                        key={t.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => {
                                          const cur = o.eligibleMemberIds ?? v.memberIds;
                                          const next = on ? cur.filter((x) => x !== t.id) : [...cur, t.id];
                                          updateOption(g.key, o.key, { eligibleMemberIds: next.length === v.memberIds.length ? null : next });
                                        }}
                                        className={cn("h-7 rounded-md border px-2.5", on ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2")}
                                      >
                                        {t.name}
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
                      <Plus className="size-4" /> Add a choice
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => addGroup("variant")} icon={<Plus className="size-4" />}>
                Variation (choose one)
              </Button>
              <Button variant="secondary" size="sm" onClick={() => addGroup("addon")} icon={<Plus className="size-4" />}>
                Add-ons (choose any)
              </Button>
            </div>
            {totalOptionsMin < 0 && <p className="text-[13px] text-ink-3">Some choices shorten the service — the shortest combination is still at least 5 minutes.</p>}
          </Section>

          <Section id="who" title="Who & where">
            <Field label="Performed by" error={errors.memberIds}>
              {() => (
                <div className="grid gap-2 sm:grid-cols-2" data-error={errors.memberIds ? true : undefined}>
                  {ctx.team.map((t) => {
                    const on = v.memberIds.includes(t.id);
                    const ov = v.staffOverrides.find((o) => o.memberId === t.id);
                    return (
                      <div key={t.id} className={cn("rounded-lg border p-3", on ? "border-ink" : "border-line")}>
                        <Checkbox checked={on} onCheckedChange={(c) => set("memberIds", c ? [...v.memberIds, t.id] : v.memberIds.filter((x) => x !== t.id))} label={<span className="flex items-center gap-2"><Avatar name={t.name} size={22} />{t.name}</span>} />
                        {on && ctx.team.length > 1 && priced && (
                          <label className="mt-2 flex items-center gap-2 pl-8 text-[13px] text-ink-3">
                            Their price
                            <input
                              inputMode="decimal"
                              value={ov?.priceCents != null ? money(ov.priceCents) : ""}
                              placeholder="Standard"
                              onChange={(e) => {
                                const cents = e.target.value ? parseMoneyInput(e.target.value) : null;
                                const rest = v.staffOverrides.filter((o) => o.memberId !== t.id);
                                set("staffOverrides", cents == null && !ov?.durationMinutes ? rest : [...rest, { memberId: t.id, priceCents: cents, durationMinutes: ov?.durationMinutes ?? null }]);
                              }}
                              className="h-8 w-24 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
                              aria-label={`${t.name}'s price`}
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
              <Field label="Offered at" hint="Leave all unchecked to offer it everywhere.">
                {() => (
                  <div className="space-y-1">
                    {ctx.locations.map((l) => (
                      <Checkbox key={l.id} checked={v.locationIds.includes(l.id)} onCheckedChange={(c) => set("locationIds", c ? [...v.locationIds, l.id] : v.locationIds.filter((x) => x !== l.id))} label={l.name} description={l.kind === "mobile" ? "Comes to the customer" : l.kind === "virtual" ? "Online" : undefined} />
                    ))}
                  </div>
                )}
              </Field>
            )}
            <Field label="Group bookings" hint="More than 1 lets several people book the same time, like a class.">
              {(p) => (
                <Select {...p} value={v.capacity} onChange={(e) => { const c = Number(e.target.value); setV((s) => ({ ...s, capacity: c, minAttendees: Math.min(s.minAttendees, c) })); setDirty(true); }}>
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "One customer at a time" : `Up to ${n} people`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Section>

          <Section id="rules" title="Booking rules">
            <Field label="Confirmation">
              {() => (
                <div className="grid gap-2">
                  <ChoiceCard selected={v.requiresApproval == null} onClick={() => set("requiresApproval", null)} title={`Business default (${ctx.businessBookingMode === "instant" ? "instant" : "approve requests"})`} />
                  <ChoiceCard selected={v.requiresApproval === false} onClick={() => set("requiresApproval", false)} title="Instant booking" />
                  <ChoiceCard selected={v.requiresApproval === true} onClick={() => set("requiresApproval", true)} title="I approve each request" description="Good for long or custom work." />
                </div>
              )}
            </Field>
            {priced && (
              <Field label="Payment at booking" hint={!ctx.paymentsEnabled ? "Online payments aren't connected yet — customers will pay in person until they are." : undefined}>
                {() => (
                  <div className="space-y-3">
                    <Segmented
                      label="Payment at booking"
                      value={v.paymentPolicy}
                      onChange={(pp) => {
                        setV((s) => ({ ...s, paymentPolicy: pp, depositType: pp === "deposit" ? (s.depositType ?? "fixed") : s.depositType }));
                        setDirty(true);
                      }}
                      options={[
                        { value: "pay_later", label: "Pay at visit" },
                        { value: "deposit", label: "Deposit" },
                        { value: "full", label: "Pay in full" },
                      ]}
                    />
                    {v.paymentPolicy === "deposit" && (
                      <div className="flex items-end gap-3">
                        <Field label="Deposit" error={errors.depositValue}>
                          {(p) => <Input {...p} inputMode="decimal" value={deposit} onChange={(e) => { setDeposit(e.target.value); setDirty(true); }} className="w-28" />}
                        </Field>
                        <Segmented label="Deposit type" size="sm" value={v.depositType ?? "fixed"} onChange={(t) => set("depositType", t)} options={[{ value: "fixed", label: ctx.currency }, { value: "percent", label: "%" }]} />
                      </div>
                    )}
                  </div>
                )}
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum notice" hint="Overrides your business setting for this service.">
                {(p) => (
                  <Select {...p} value={v.minNoticeMinutes ?? ""} onChange={(e) => set("minNoticeMinutes", e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">Business default</option>
                    {[[0, "None"], [60, "1 hour"], [240, "4 hours"], [1440, "1 day"], [2880, "2 days"], [10080, "1 week"]].map(([m, l]) => (
                      <option key={m} value={m}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Book up to">
                {(p) => (
                  <Select {...p} value={v.maxAdvanceDays ?? ""} onChange={(e) => set("maxAdvanceDays", e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">Business default</option>
                    {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                      <option key={d} value={d}>
                        {d} days ahead
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section id="questions" title="Questions & requirements" lead="Ask what you need to know before the appointment. Keep it short — every question adds friction.">
            {ctx.forms.length > 0 ? (
              <Field label="Intake questions">
                {(p) => (
                  <Select {...p} value={v.intakeFormId ?? ""} onChange={(e) => set("intakeFormId", e.target.value || null)}>
                    <option value="">None</option>
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
                Create reusable question sets in <Link href="/pro/settings/forms" className="font-medium text-ink underline underline-offset-2">Settings → Questions</Link>.
              </p>
            )}
            <Field label="Instructions for the customer" optional hint="Shown before they confirm, e.g. “Arrive with clean, dry hair”.">
              {(p) => <Textarea {...p} rows={2} value={v.bookingInstructions ?? ""} onChange={(e) => set("bookingInstructions", e.target.value || null)} maxLength={2000} />}
            </Field>
            <Field label="Waiver or consent" optional hint="Customers must tick to accept it. We store when they did.">
              {(p) => <Textarea {...p} rows={3} value={v.consentText ?? ""} onChange={(e) => set("consentText", e.target.value || null)} maxLength={3000} />}
            </Field>
            <Field label="Minimum age" optional>
              {(p) => (
                <Select {...p} value={v.minAge ?? ""} onChange={(e) => set("minAge", e.target.value ? Number(e.target.value) : null)} className="w-48">
                  <option value="">No requirement</option>
                  {[13, 16, 18, 21].map((a) => (
                    <option key={a} value={a}>
                      {a}+
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Section>

          <Section id="photo" title="Photo">
            <div className="flex items-start gap-5">
              <div className="relative aspect-[4/3] w-44 overflow-hidden rounded-lg border border-line bg-surface-2">
                {cover ? <MediaImage media={cover} sizes="176px" className="size-full" /> : <span className="flex size-full items-center justify-center text-[13px] text-ink-3">No photo</span>}
                {uploading != null && <span className="absolute inset-0 flex items-center justify-center bg-ink/60 text-sm font-semibold text-white tabular">{uploading}%</span>}
              </div>
              <div className="space-y-2">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2">
                  <Camera className="size-4" /> {cover ? "Replace" : "Upload photo"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onCover(e.target.files?.[0])} />
                </label>
                {cover && (
                  <button type="button" className="block text-sm text-ink-3 hover:text-danger" onClick={() => { setCover(null); set("coverMediaId", null); }}>
                    Remove photo
                  </button>
                )}
                <p className="max-w-xs text-[13px] text-ink-3">Show your real work. Portfolio posts can also link to this service with “Book this”.</p>
              </div>
            </div>
          </Section>
        </div>

        <aside className="hidden lg:block" aria-label="Customer preview">
          <div className="sticky top-8 space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">What customers see</p>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {cover && <MediaImage media={cover} sizes="300px" className="aspect-[16/10] w-full" />}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-semibold text-ink">{v.name || "Service name"}</p>
                  <p className="shrink-0 text-[15px] font-semibold text-ink tabular">{previewPrice}</p>
                </div>
                {v.description && <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-3">{v.description}</p>}
                <p className="mt-2 text-[12px] text-ink-3">
                  {formatDuration(v.durationMinutes)}
                  {groups.length > 0 && " · Options available"}
                  {v.capacity > 1 && ` · Up to ${v.capacity} people`}
                </p>
                {groups.slice(0, 2).map((g) => (
                  <div key={g.key} className="mt-3">
                    <p className="text-[12px] font-medium text-ink-2">{g.name || "Options"}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.options.slice(0, 4).map((o) => (
                        <span key={o.key} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2">
                          {o.name || "…"}
                          {o.price && parseMoneyInput(o.price) ? ` +${formatMoney(parseMoneyInput(o.price)!, ctx.currency, { compact: true })}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="mt-4 flex h-9 items-center justify-center rounded-md bg-ink text-sm font-medium text-bg">{v.requiresApproval ?? ctx.businessBookingMode === "request" ? "Request" : "Book"}</div>
              </div>
            </div>
            <Switch checked={v.status === "active"} onCheckedChange={(on) => set("status", on ? "active" : "hidden")} label="Visible on your profile" description={v.status === "active" ? "Customers can book it." : "Hidden — only your team can book it."} />
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:bottom-0 lg:left-[248px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <p className="text-sm text-ink-3" aria-live="polite">
            {saving ? "Saving…" : dirty ? "Unsaved changes" : serviceId ? "All changes saved" : "New service"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push("/pro/services")} disabled={saving}>
              {dirty ? "Discard" : "Back"}
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty && Boolean(serviceId)}>
              {serviceId ? "Save changes" : "Create service"}
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
