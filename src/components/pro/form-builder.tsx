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

const TYPE_HINTS: Record<FieldType, string> = {
  short_text: "A name, a number, a few words.",
  long_text: "Room for a few sentences.",
  yes_no: "Two buttons: Yes and No.",
  single_choice: "Clients pick one option.",
  multi_choice: "Clients tick any that apply.",
  date: "A date picker, e.g. date of birth or event date.",
  acknowledgement: "A statement clients tick to confirm they've read it.",
};

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
function validate(name: string, drafts: Draft[]) {
  const errors: Record<string, string> = {};
  if (name.trim().length < 2) errors.name = "Give the form a name";
  for (const d of drafts) {
    if (!d.label.trim()) errors[`${d.id}.label`] = d.type === "acknowledgement" ? "Write the statement clients agree to" : "Write the question";
    if (isChoice(d.type)) {
      const opts = d.options.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) errors[`${d.id}.options`] = "Add at least two choices";
      else if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) errors[`${d.id}.options`] = "Each choice needs to be different";
    }
  }
  return errors;
}

/** Warns before leaving with unsaved edits: closing the tab, and clicking any in-app link. */
function useUnsavedGuard(dirty: boolean) {
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
      if (!window.confirm("You have unsaved changes to this form. Leave without saving them?")) {
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
  }, [dirty]);
}

export function FormBuilder({ formId, initial, usedBy }: { formId?: string; initial: { name: string; fields: FormField[] }; usedBy: FormUsageItem[] }) {
  const router = useRouter();
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
  useUnsavedGuard(dirty && !saving);

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
    const errs = validate(name, drafts);
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
        toast.success("Form saved");
        router.refresh();
      } else {
        toast.success("Form created");
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
      toast.success(res.services.length ? `Form archived and removed from ${res.services.length} service${res.services.length === 1 ? "" : "s"}` : "Form archived");
      setBaseline(current);
      router.push("/pro/settings/forms");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
      setArchiving(false);
    }
  }

  const previewFields = drafts.map(toField).map((f) => ({ ...f, label: f.label || "Untitled question" }));
  const errorCount = Object.keys(errors).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="min-w-0 break-words font-display text-[30px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[36px]">{formId ? initial.name : "New form"}</h1>
        {formId && (
          <Button variant="ghost" size="sm" icon={<Archive className="size-4" />} onClick={() => setArchiveOpen(true)}>
            Archive form
          </Button>
        )}
      </div>

      <div className="mt-5 lg:hidden">
        <Segmented
          label="Show"
          value={pane}
          onChange={setPane}
          options={[
            { value: "edit", label: `Questions${drafts.length ? ` (${drafts.length})` : ""}` },
            { value: "preview", label: "Client preview" },
          ]}
        />
      </div>

      <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-10">
        {/* Editor */}
        <div className={cn("min-w-0 space-y-6", pane === "preview" && "hidden lg:block")}>
          <FormError message={formError} />
          <section aria-labelledby="form-details" className="rounded-xl border border-line bg-surface px-5 py-5 sm:px-6">
            <h2 id="form-details" className="sr-only">
              Form details
            </h2>
            <Field label="Form name" hint="Only your team sees this. Clients just see the questions." error={errors.name}>
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
                  placeholder="e.g. New client consultation"
                  autoFocus={!formId}
                />
              )}
            </Field>
            {formId && <UsageLine usedBy={usedBy} />}
          </section>

          <section aria-labelledby="questions-h">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="questions-h" className="text-base font-semibold text-ink">
                Questions
              </h2>
              <p className="text-[13px] text-ink-3 tabular">
                {drafts.length} of {MAX_QUESTIONS}
              </p>
            </div>
            {drafts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
                <p className="text-sm font-medium text-ink">No questions yet</p>
                <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-3">Keep it short. Two or three questions get answered; ten get skipped.</p>
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
            {saving ? "Saving…" : errorCount ? `Fix ${errorCount} thing${errorCount === 1 ? "" : "s"} before saving` : dirty ? "Unsaved changes" : formId ? "All changes saved" : "New form"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={discard} disabled={saving || (!dirty && Boolean(formId))}>
              {formId ? "Discard" : "Cancel"}
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty && Boolean(formId)}>
              {formId ? "Save changes" : "Create form"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive “${initial.name}”?`}
        confirmLabel={usedBy.length ? `Archive and remove from ${usedBy.length} service${usedBy.length === 1 ? "" : "s"}` : "Archive form"}
        onConfirm={archive}
        loading={archiving}
        description={
          usedBy.length
            ? "These services will stop asking these questions on new bookings until you choose another form:"
            : "No service asks this form, so nothing changes for clients."
        }
      >
        {usedBy.length > 0 && (
          <ul className="mb-3 list-disc space-y-0.5 ps-5 text-sm text-ink-2">
            {usedBy.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
        )}
        <p className="text-sm leading-relaxed text-ink-3">Answers already given on past and upcoming bookings stay on those bookings.{dirty ? " Unsaved edits to this form will be lost." : ""}</p>
      </ConfirmDialog>
    </>
  );
}

function UsageLine({ usedBy }: { usedBy: FormUsageItem[] }) {
  if (!usedBy.length)
    return (
      <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-3">
        No service asks this form yet. Open a service in{" "}
        <Link href="/pro/services" className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
          Services
        </Link>{" "}
        and choose it under Questions &amp; requirements.
      </p>
    );
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-[13px] font-medium text-ink-2">Asked when clients book</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {usedBy.map((s) => (
          <li key={s.id} className="text-sm">
            <Link href={`/pro/services/${s.id}#questions`} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
              {s.name}
            </Link>
            {s.status !== "active" && <span className="text-ink-3"> · hidden</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-ink-3">Changes apply to new bookings for these services as soon as you save.</p>
    </div>
  );
}

function AddQuestion({ onAdd, disabled }: { onAdd: (t: FieldType) => void; disabled: boolean }) {
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <Button variant="secondary" icon={<Plus className="size-4" />}>
          {disabled ? `Limit of ${MAX_QUESTIONS} questions reached` : "Add question"}
        </Button>
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>Question type</MenuLabel>
        {(Object.keys(FIELD_TYPES) as FieldType[]).map((t) => {
          const Icon = TYPE_ICONS[t];
          return (
            <MenuItem key={t} icon={<Icon />} onSelect={() => onAdd(t)}>
              {FIELD_TYPES[t]}
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
            <span className={cn("block text-[15px] font-medium", d.label.trim() ? "text-ink" : "text-ink-3")}>{d.label.trim() || "Untitled question"}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3">
              <Icon className="size-3.5" aria-hidden />
              {FIELD_TYPES[d.type]}
              {d.required && <span>· Required</span>}
              {hasError && !open && <span className="text-danger">· Needs attention</span>}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center py-2">
          <IconButton label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => p.onMove(-1)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label={`Move question ${index + 1} down`} disabled={index === count - 1} onClick={() => p.onMove(1)}>
            <ArrowDown className="size-4" />
          </IconButton>
        </div>
      </div>

      {open && (
        <div id={`${d.id}-panel`} className="space-y-4 border-t border-line px-4 pb-4 pt-4 sm:px-5">
          <Field label="Type" hint={TYPE_HINTS[d.type]}>
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
                {(Object.keys(FIELD_TYPES) as FieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPES[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={ack ? "Statement" : "Question"} error={p.labelError}>
            {(fp) =>
              ack ? (
                <Textarea {...fp} data-focus={d.id} rows={2} value={d.label} onChange={(e) => p.onChange({ label: e.target.value })} maxLength={200} placeholder="e.g. I understand a patch test is needed 48 hours before a colour service." />
              ) : (
                <Input {...fp} data-focus={d.id} value={d.label} onChange={(e) => p.onChange({ label: e.target.value })} maxLength={200} placeholder={PLACEHOLDERS[d.type]} />
              )
            }
          </Field>
          <Field label="Help text" optional hint={ack ? "Shown under the statement, e.g. where to read the full policy." : "Shown under the question."}>
            {(fp) => <Input {...fp} value={d.helpText} onChange={(e) => p.onChange({ helpText: e.target.value })} maxLength={500} />}
          </Field>
          {isChoice(d.type) && <OptionsEditor id={d.id} options={d.options} onChange={(options) => p.onChange({ options })} error={p.optionsError} multi={d.type === "multi_choice"} />}
          <div className="rounded-lg bg-surface-2/70 px-3.5 py-2">
            <Switch
              checked={d.required}
              onCheckedChange={(required) => p.onChange({ required })}
              label={ack ? "Must be ticked to book" : "Required"}
              description={d.required ? (ack ? "Clients can't book until they tick it." : "Clients can't book without answering.") : "Clients can skip it."}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={p.onDuplicate} disabled={!p.canDuplicate}>
                Duplicate
              </Button>
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={p.onRemove} className="text-danger hover:bg-danger-soft hover:text-danger">
                Delete
              </Button>
            </div>
            <Button variant="secondary" size="sm" onClick={p.onToggle}>
              Done
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

const PLACEHOLDERS: Record<FieldType, string> = {
  short_text: "e.g. What's the make and model of your car?",
  long_text: "e.g. Tell us about any injuries we should know about.",
  yes_no: "e.g. Is this your first visit?",
  single_choice: "e.g. How long is your hair right now?",
  multi_choice: "e.g. Which areas would you like us to focus on?",
  date: "e.g. When is the event?",
  acknowledgement: "",
};

function OptionsEditor({ id, options, onChange, error, multi }: { id: string; options: string[]; onChange: (o: string[]) => void; error?: string; multi: boolean }) {
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
      <legend className="mb-1.5 text-sm font-medium text-ink">Choices</legend>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={cn("size-4 shrink-0 border border-line-strong", multi ? "rounded-[4px]" : "rounded-full")} aria-hidden />
            <Input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={o}
              aria-label={`Choice ${i + 1}`}
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
              placeholder={`Choice ${i + 1}`}
            />
            <IconButton label={`Remove choice ${i + 1}`} disabled={options.length <= 2} onClick={() => onChange(options.filter((_, j) => j !== i))}>
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
        {options.length >= MAX_OPTIONS ? `${MAX_OPTIONS} choices maximum` : "Add choice"}
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
function Preview({ fields }: { fields: FormField[] }) {
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
    setChecked(res.ok ? {} : res.errors);
  }

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 id="preview-h" className="text-sm font-semibold text-ink">
            Client preview
          </h2>
          <p className="text-[13px] text-ink-3">The “A few details” step of booking. Try it; nothing is saved.</p>
        </div>
      </div>
      <div className="space-y-6 px-5 py-5">
        {fields.length === 0 && <p className="text-sm text-ink-3">Questions you add appear here as clients will see them.</p>}
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
        <Field label="Anything else they should know?" optional hint="Every booking ends with this box. It isn't part of your form.">
          {(fp) => <Textarea {...fp} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Allergies, preferences, parking notes…" />}
        </Field>
      </div>
      {fields.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          <p className="text-[13px] text-ink-3" aria-live="polite">
            {checked == null ? "" : Object.keys(checked).length ? `${Object.keys(checked).length} answer${Object.keys(checked).length === 1 ? "" : "s"} missing or invalid` : "All good — this would go through."}
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
              Clear
            </Button>
            <Button variant="secondary" size="sm" onClick={check}>
              Try continuing
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
