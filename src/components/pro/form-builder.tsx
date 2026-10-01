"use client";

import {
  AlignLeft,
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CircleDot,
  Copy,
  FileCheck2,
  ListChecks,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { IntakeField } from "@/components/booking/intake-field";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { FIELD_TYPES, validateAnswers, type FieldType, type FormField } from "@/domain/forms";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import type { TFunction } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

const MAX_QUESTIONS = 30;
const MAX_OPTIONS = 20;

const TYPE_ICONS: Record<FieldType, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  yes_no: ToggleLeft,
  single_choice: CircleDot,
  multi_choice: ListChecks,
  date: CalendarDays,
  acknowledgement: FileCheck2,
};

// Type names, hints and placeholders live in messages under `proSettings.builder.types.<type>`.
const FIELD_TYPE_KEYS = Object.keys(FIELD_TYPES) as FieldType[];

const isChoice = (t: FieldType) => t === "single_choice" || t === "multi_choice";

type Draft = { id: string; type: FieldType; label: string; helpText: string; required: boolean; options: string[] };
export type FormUsageItem = { id: string; name: string; status: string };

function toDraft(f: FormField): Draft {
  return { id: f.id, type: f.type, label: f.label, helpText: f.helpText ?? "", required: f.required, options: f.options?.length ? [...f.options] : isChoice(f.type) ? ["", ""] : [] };
}

function toField(d: Draft): FormField {
  const out: FormField = { id: d.id, type: d.type, label: d.label.trim(), required: d.required };
  if (d.helpText.trim()) out.helpText = d.helpText.trim();
  if (isChoice(d.type)) out.options = d.options.map((o) => o.trim()).filter(Boolean);
  return out;
}

function newId() {
  return `q_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

/** Same rules the server enforces (domain/forms.ts), checked before saving so errors land on the right question. */
function validate(t: TFunction, name: string, drafts: Draft[]) {
  const errors: Record<string, string> = {};
  if (name.trim().length < 2) errors.name = t("builder.errors.name");
  for (const d of drafts) {
    if (!d.label.trim()) errors[`${d.id}.label`] = d.type === "acknowledgement" ? t("builder.errors.statement") : t("builder.errors.question");
    if (isChoice(d.type)) {
      const opts = d.options.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) errors[`${d.id}.options`] = t("builder.errors.twoChoices");
      else if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) errors[`${d.id}.options`] = t("builder.errors.distinct");
    }
  }
  return errors;
}

/** Warns before leaving with unsaved edits: closing the tab, and clicking any in-app link. */
function useUnsavedGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}

export function FormBuilder({ formId, initial, usedBy }: { formId?: string; initial: { name: string; fields: FormField[] }; usedBy: FormUsageItem[] }) {
  const router = useRouter();
  const t = useT("proSettings");
  const [baseline, setBaseline] = useState(() => JSON.stringify({ name: initial.name, fields: initial.fields.map(toDraft).map(toField) }));
  const [name, setName] = useState(initial.name);
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.fields.map(toDraft));
  const [openId, setOpenId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const focusRef = useRef<string | null>(null);

  const current = useMemo(() => JSON.stringify({ name: name.trim(), fields: drafts.map(toField) }), [name, drafts]);
  const dirty = current !== baseline || (!formId && (name.trim() !== "" || drafts.length > 0));
  useUnsavedGuard(dirty && !saving, t("builder.leaveConfirm"));

  // Move focus to the question that was just added or opened with an error.
  useEffect(() => {
    if (!focusRef.current) return;
    document.querySelector<HTMLElement>(`[data-focus="${focusRef.current}"]`)?.focus();
    focusRef.current = null;
  });

  function update(id: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setErrors((e) => {
      const next = { ...e };
      delete next[`${id}.label`];
      delete next[`${id}.options`];
      return next;
    });
  }
  function add(type: FieldType) {
    const d: Draft = { id: newId(), type, label: "", helpText: "", required: type === "acknowledgement", options: isChoice(type) ? ["", ""] : [] };
    setDrafts((ds) => [...ds, d]);
    setOpenId(d.id);
    setPane("edit");
    focusRef.current = d.id;
  }
  function move(id: string, by: -1 | 1) {
    setDrafts((ds) => {
      const i = ds.findIndex((d) => d.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function duplicate(id: string) {
    const i = drafts.findIndex((d) => d.id === id);
    if (i < 0) return;
    const copy = { ...drafts[i], id: newId(), options: [...drafts[i].options] };
    setDrafts([...drafts.slice(0, i + 1), copy, ...drafts.slice(i + 1)]);
    setOpenId(copy.id);
    focusRef.current = copy.id;
  }
  function remove(id: string) {
    setDrafts((ds) => ds.filter((d) => d.id !== id));
    if (openId === id) setOpenId(null);
  }

  function discard() {
    if (!formId) {
      router.push("/pro/settings/forms");
      return;
    }
    const b = JSON.parse(baseline) as { name: string; fields: FormField[] };
    setName(b.name);
    setDrafts(b.fields.map(toDraft));
    setErrors({});
    setFormError(null);
  }

  async function save() {
    const errs = validate(t, name, drafts);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) {
      const first = drafts.find((d) => errs[`${d.id}.label`] || errs[`${d.id}.options`]);
      if (first) {
        setOpenId(first.id);
        setPane("edit");
        focusRef.current = first.id;
      } else document.querySelector<HTMLElement>('[data-focus="form-name"]')?.focus();
      return;
    }
    setSaving(true);
    const body = { name: name.trim(), fields: drafts.map(toField) };
    try {
      const row = await api<{ id: string }>(formId ? `/api/pro/forms/${formId}` : "/api/pro/forms", { method: formId ? "PUT" : "POST", body });
      setBaseline(JSON.stringify(body));
      if (formId) {
        toast.success(t("builder.toasts.saved"));
        router.refresh();
      } else {
        toast.success(t("builder.toasts.created"));
        router.replace(`/pro/settings/forms/${row.id}`);
      }
    } catch (err) {
      const e = err as ApiError;
      // Server field errors come back as "fields.<index>.<prop>"; map them onto the question.
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(e.fields ?? {})) {
        const m = /^fields\.(\d+)\.(\w+)/.exec(k);
        if (m && drafts[Number(m[1])]) mapped[`${drafts[Number(m[1])].id}.${m[2] === "options" ? "options" : "label"}`] = v;
        else if (k === "name") mapped.name = v;
      }
      setErrors(mapped);
      setFormError(Object.keys(mapped).length ? null : e.message);
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!formId) return;
    setArchiving(true);
    try {
      const res = await api<{ services: { id: string; name: string }[] }>(`/api/pro/forms/${formId}`, { method: "DELETE" });
      toast.success(res.services.length ? t("builder.toasts.archivedFrom", { count: res.services.length }) : t("builder.toasts.archived"));
      setBaseline(current);
      router.push("/pro/settings/forms");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
      setArchiving(false);
    }
  }

  const previewFields = drafts.map(toField).map((f) => ({ ...f, label: f.label || t("builder.untitled") }));
  const errorCount = Object.keys(errors).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="min-w-0 break-words font-display text-[30px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[36px]">{formId ? initial.name : t("forms.newForm")}</h1>
        {formId && (
          <Button variant="ghost" size="sm" icon={<Archive className="size-4" />} onClick={() => setArchiveOpen(true)}>
            {t("builder.archive")}
          </Button>
        )}
      </div>

      <div className="mt-5 lg:hidden">
        <Segmented
          label={t("builder.show")}
          value={pane}
          onChange={setPane}
          options={[
            { value: "edit", label: drafts.length ? t("builder.questionsTab", { count: drafts.length }) : t("builder.questions") },
            { value: "preview", label: t("builder.previewTab") },
          ]}
        />
      </div>

      <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-10">
        {/* Editor */}
        <div className={cn("min-w-0 space-y-6", pane === "preview" && "hidden lg:block")}>
          <FormError message={formError} />
          <section aria-labelledby="form-details" className="rounded-xl border border-line bg-surface px-5 py-5 sm:px-6">
            <h2 id="form-details" className="sr-only">
              {t("builder.details")}
            </h2>
            <Field label={t("builder.nameLabel")} hint={t("builder.nameHint")} error={errors.name}>
              {(p) => (
                <Input
                  {...p}
                  data-focus="form-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrors(({ name: _n, ...rest }) => rest);
                  }}
                  maxLength={80}
                  placeholder={t("builder.namePlaceholder")}
                  autoFocus={!formId}
                />
              )}
            </Field>
            {formId && <UsageLine usedBy={usedBy} />}
          </section>

          <section aria-labelledby="questions-h">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="questions-h" className="text-base font-semibold text-ink">
                {t("builder.questions")}
              </h2>
              <p className="text-[13px] text-ink-3 tabular">{t("builder.questionCount", { count: drafts.length, max: MAX_QUESTIONS })}</p>
            </div>
            {drafts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
                <p className="text-sm font-medium text-ink">{t("builder.emptyTitle")}</p>
                <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-3">{t("builder.emptyBody")}</p>
                <div className="mt-4 flex justify-center">
                  <AddQuestion onAdd={add} disabled={false} />
                </div>
              </div>
            ) : (
              <ol className="space-y-2">
                {drafts.map((d, i) => (
                  <QuestionCard
                    key={d.id}
                    draft={d}
                    index={i}
                    count={drafts.length}
                    open={openId === d.id}
                    onToggle={() => setOpenId(openId === d.id ? null : d.id)}
                    onChange={(patch) => update(d.id, patch)}
                    onMove={(by) => move(d.id, by)}
                    onDuplicate={() => duplicate(d.id)}
                    onRemove={() => remove(d.id)}
                    canDuplicate={drafts.length < MAX_QUESTIONS}
                    labelError={errors[`${d.id}.label`]}
                    optionsError={errors[`${d.id}.options`]}
                  />
                ))}
              </ol>
            )}
            {drafts.length > 0 && (
              <div className="mt-3">
                <AddQuestion onAdd={add} disabled={drafts.length >= MAX_QUESTIONS} />
              </div>
            )}
          </section>
        </div>

        {/* Preview */}
        <aside aria-labelledby="preview-h" className={cn("min-w-0", pane === "edit" && "hidden lg:block")}>
          <div className="lg:sticky lg:top-8">
            <Preview fields={previewFields} />
          </div>
        </aside>
      </div>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:bottom-0 lg:start-[248px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <p className={cn("min-w-0 truncate text-sm", errorCount ? "text-danger" : "text-ink-3")} aria-live="polite">
            {saving
              ? t("builder.saveBar.saving")
              : errorCount
                ? t("builder.saveBar.fix", { count: errorCount })
                : dirty
                  ? t("builder.saveBar.unsaved")
                  : formId
                    ? t("builder.saveBar.allSaved")
                    : t("builder.saveBar.newForm")}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={discard} disabled={saving || (!dirty && Boolean(formId))}>
              {formId ? t("builder.saveBar.discard") : t("builder.saveBar.cancel")}
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty && Boolean(formId)}>
              {formId ? t("builder.saveBar.save") : t("builder.saveBar.create")}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t("builder.archiveDialog.title", { name: initial.name })}
        confirmLabel={usedBy.length ? t("builder.archiveDialog.confirmUsed", { count: usedBy.length }) : t("builder.archiveDialog.confirm")}
        onConfirm={archive}
        loading={archiving}
        description={usedBy.length ? t("builder.archiveDialog.descriptionUsed") : t("builder.archiveDialog.descriptionUnused")}
      >
        {usedBy.length > 0 && (
          <ul className="mb-3 list-disc space-y-0.5 ps-5 text-sm text-ink-2">
            {usedBy.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
        )}
        <p className="text-sm leading-relaxed text-ink-3">
          {t("builder.archiveDialog.keep")}
          {dirty ? ` ${t("builder.archiveDialog.lost")}` : ""}
        </p>
      </ConfirmDialog>
    </>
  );
}

function UsageLine({ usedBy }: { usedBy: FormUsageItem[] }) {
  const t = useT("proSettings");
  if (!usedBy.length)
    return (
      <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-3">
        {rich(t("builder.usage.none"), {
          link: (c) => (
            <Link href="/pro/services" className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
              {c}
            </Link>
          ),
        })}
      </p>
    );
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-[13px] font-medium text-ink-2">{t("builder.usage.title")}</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {usedBy.map((s) => (
          <li key={s.id} className="text-sm">
            <Link href={`/pro/services/${s.id}#questions`} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
              {s.name}
            </Link>
            {s.status !== "active" && <span className="text-ink-3"> · {t("builder.usage.hidden")}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-ink-3">{t("builder.usage.note")}</p>
    </div>
  );
}

function AddQuestion({ onAdd, disabled }: { onAdd: (type: FieldType) => void; disabled: boolean }) {
  const t = useT("proSettings");
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <Button variant="secondary" icon={<Plus className="size-4" />}>
          {disabled ? t("builder.add.limit", { max: MAX_QUESTIONS }) : t("builder.add.label")}
        </Button>
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>{t("builder.add.type")}</MenuLabel>
        {FIELD_TYPE_KEYS.map((type) => {
          const Icon = TYPE_ICONS[type];
          return (
            <MenuItem key={type} icon={<Icon />} onSelect={() => onAdd(type)}>
              {t(`builder.types.${type}.label`)}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

function QuestionCard(p: {
  draft: Draft;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canDuplicate: boolean;
  labelError?: string;
  optionsError?: string;
}) {
  const t = useT("proSettings");
  const { draft: d, index, count, open } = p;
  const Icon = TYPE_ICONS[d.type];
  const hasError = Boolean(p.labelError || p.optionsError);
  const ack = d.type === "acknowledgement";

  return (
    <li className={cn("rounded-xl border bg-surface", hasError ? "border-danger/50" : open ? "border-line-strong" : "border-line")}>
      <div className="flex items-start gap-1 ps-4 pe-2 sm:ps-5">
        <button type="button" onClick={p.onToggle} aria-expanded={open} aria-controls={`${d.id}-panel`} className="flex min-h-14 min-w-0 flex-1 items-start gap-3 py-3.5 text-start">
          <span className="mt-px w-5 shrink-0 text-sm text-ink-3 tabular">{index + 1}.</span>
          <span className="min-w-0 flex-1">
            <span className={cn("block text-[15px] font-medium", d.label.trim() ? "text-ink" : "text-ink-3")}>{d.label.trim() || t("builder.untitled")}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3">
              <Icon className="size-3.5" aria-hidden />
              {t(`builder.types.${d.type}.label`)}
              {d.required && <span>· {t("builder.card.required")}</span>}
              {hasError && !open && <span className="text-danger">· {t("builder.card.attention")}</span>}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center py-2">
          <IconButton label={t("builder.card.moveUp", { n: index + 1 })} disabled={index === 0} onClick={() => p.onMove(-1)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label={t("builder.card.moveDown", { n: index + 1 })} disabled={index === count - 1} onClick={() => p.onMove(1)}>
            <ArrowDown className="size-4" />
          </IconButton>
        </div>
      </div>

      {open && (
        <div id={`${d.id}-panel`} className="space-y-4 border-t border-line px-4 pb-4 pt-4 sm:px-5">
          <Field label={t("builder.card.type")} hint={t(`builder.types.${d.type}.hint`)}>
            {(fp) => (
              <Select
                {...fp}
                value={d.type}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  const options = isChoice(type) && d.options.length < 2 ? [...d.options, "", ""].slice(0, 2) : d.options;
                  p.onChange({ type, options });
                }}
              >
                {FIELD_TYPE_KEYS.map((type) => (
                  <option key={type} value={type}>
                    {t(`builder.types.${type}.label`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={ack ? t("builder.card.statement") : t("builder.card.question")} error={p.labelError}>
            {(fp) =>
              ack ? (
                <Textarea {...fp} data-focus={d.id} rows={2} value={d.label} onChange={(e) => p.onChange({ label: e.target.value })} maxLength={200} placeholder={t("builder.types.acknowledgement.placeholder")} />
              ) : (
                <Input {...fp} data-focus={d.id} value={d.label} onChange={(e) => p.onChange({ label: e.target.value })} maxLength={200} placeholder={t(`builder.types.${d.type}.placeholder`)} />
              )
            }
          </Field>
          <Field label={t("builder.card.helpText")} optional hint={ack ? t("builder.card.helpAck") : t("builder.card.helpQuestion")}>
            {(fp) => <Input {...fp} value={d.helpText} onChange={(e) => p.onChange({ helpText: e.target.value })} maxLength={500} />}
          </Field>
          {isChoice(d.type) && <OptionsEditor id={d.id} options={d.options} onChange={(options) => p.onChange({ options })} error={p.optionsError} multi={d.type === "multi_choice"} />}
          <div className="rounded-lg bg-surface-2/70 px-3.5 py-2">
            <Switch
              checked={d.required}
              onCheckedChange={(required) => p.onChange({ required })}
              label={ack ? t("builder.card.mustTick") : t("builder.card.required")}
              description={d.required ? (ack ? t("builder.card.ackRequired") : t("builder.card.questionRequired")) : t("builder.card.optional")}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={p.onDuplicate} disabled={!p.canDuplicate}>
                {t("builder.card.duplicate")}
              </Button>
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={p.onRemove} className="text-danger hover:bg-danger-soft hover:text-danger">
                {t("builder.card.delete")}
              </Button>
            </div>
            <Button variant="secondary" size="sm" onClick={p.onToggle}>
              {t("builder.card.done")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function OptionsEditor({ id, options, onChange, error, multi }: { id: string; options: string[]; onChange: (o: string[]) => void; error?: string; multi: boolean }) {
  const t = useT("proSettings");
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndex.current == null) return;
    refs.current[focusIndex.current]?.focus();
    focusIndex.current = null;
  });
  function addAt(i: number) {
    if (options.length >= MAX_OPTIONS) return;
    const next = [...options.slice(0, i), "", ...options.slice(i)];
    focusIndex.current = i;
    onChange(next);
  }
  return (
    <fieldset aria-describedby={error ? `${id}-opt-error` : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-ink">{t("builder.options.legend")}</legend>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={cn("size-4 shrink-0 border border-line-strong", multi ? "rounded-[4px]" : "rounded-full")} aria-hidden />
            <Input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={o}
              aria-label={t("builder.options.choice", { n: i + 1 })}
              aria-invalid={error && !o.trim() ? true : undefined}
              onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAt(i + 1);
                }
                if (e.key === "Backspace" && !o && options.length > 2) {
                  e.preventDefault();
                  focusIndex.current = Math.max(0, i - 1);
                  onChange(options.filter((_, j) => j !== i));
                }
              }}
              maxLength={100}
              placeholder={t("builder.options.choice", { n: i + 1 })}
            />
            <IconButton label={t("builder.options.remove", { n: i + 1 })} disabled={options.length <= 2} onClick={() => onChange(options.filter((_, j) => j !== i))}>
              <X className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      {error && (
        <p id={`${id}-opt-error`} role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => addAt(options.length)}
        disabled={options.length >= MAX_OPTIONS}
        className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        {options.length >= MAX_OPTIONS ? t("builder.options.max", { max: MAX_OPTIONS }) : t("builder.options.add")}
      </button>
    </fieldset>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** The questions rendered with the booking flow's own component, answerable so the pro can try them. */
/** The domain check's English messages, in the viewer's language. */
function previewError(t: TFunction, english: string) {
  const known: Record<string, string> = {
    "Please confirm to continue.": "confirm",
    "This question is required.": "required",
    "Invalid answer.": "invalid",
    "Choose one of the options.": "choose",
    "Invalid choice.": "invalidChoice",
    "Enter a valid date.": "date",
  };
  if (known[english]) return t(`builder.preview.errors.${known[english]}`);
  const tooLong = /^Keep it under (\d+) characters\.$/.exec(english);
  return tooLong ? t("builder.preview.errors.tooLong", { max: Number(tooLong[1]) }) : english;
}

function Preview({ fields }: { fields: FormField[] }) {
  const t = useT("proSettings");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [checked, setChecked] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState("");
  const fieldsKey = fields.map((f) => `${f.id}:${f.type}:${f.required}:${(f.options ?? []).join("|")}`).join(",");
  const [prevKey, setPrevKey] = useState(fieldsKey);
  if (fieldsKey !== prevKey) {
    setPrevKey(fieldsKey);
    setChecked(null);
  }

  function check() {
    const res = validateAnswers(fields, answers);
    setChecked(res.ok ? {} : Object.fromEntries(Object.entries(res.errors).map(([k, v]) => [k, previewError(t, v)])));
  }

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 id="preview-h" className="text-sm font-semibold text-ink">
            {t("builder.preview.title")}
          </h2>
          <p className="text-[13px] text-ink-3">{t("builder.preview.description")}</p>
        </div>
      </div>
      <div className="space-y-6 px-5 py-5">
        {fields.length === 0 && <p className="text-sm text-ink-3">{t("builder.preview.empty")}</p>}
        {fields.map((f) => (
          <IntakeField
            key={f.id}
            field={f}
            value={answers[f.id]}
            onChange={(v) => {
              setAnswers((a) => ({ ...a, [f.id]: v }));
              if (checked?.[f.id]) setChecked((c) => (c ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== f.id)) : c));
            }}
            error={checked?.[f.id]}
          />
        ))}
        <Field label={t("builder.preview.noteLabel")} optional hint={t("builder.preview.noteHint")}>
          {(fp) => <Textarea {...fp} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t("builder.preview.notePlaceholder")} />}
        </Field>
      </div>
      {fields.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          <p className="text-[13px] text-ink-3" aria-live="polite">
            {checked == null ? "" : Object.keys(checked).length ? t("builder.preview.invalid", { count: Object.keys(checked).length }) : t("builder.preview.allGood")}
          </p>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAnswers({});
                setChecked(null);
                setNote("");
              }}
            >
              {t("builder.preview.clear")}
            </Button>
            <Button variant="secondary" size="sm" onClick={check}>
              {t("builder.preview.tryContinue")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
