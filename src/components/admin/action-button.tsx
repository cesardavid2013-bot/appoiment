"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Select, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle" | "accent";

export type ActionChoice = { name: string; label: string; options: { value: string; label: string; description?: string }[]; defaultValue?: string; hint?: string };
export type ActionNote = { name: string; label: string; required?: boolean; requiredFor?: string[]; placeholder?: string; hint?: string; maxLength?: number };

/**
 * A button that opens a confirmation dialog, optionally collects a choice and
 * a note/reason, posts JSON to an admin endpoint and refreshes the page.
 * Every prop is serialisable so server components can configure it.
 */
export function ActionButton({
  endpoint,
  method = "POST",
  body,
  label,
  icon,
  variant = "secondary",
  size = "sm",
  title,
  description,
  confirmLabel,
  tone = "primary",
  choice,
  note,
  success,
  redirectTo,
  disabled,
  disabledReason,
  className,
}: {
  endpoint: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  label: string;
  icon?: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  choice?: ActionChoice;
  note?: ActionNote;
  success: string;
  redirectTo?: string;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(choice?.defaultValue ?? choice?.options[0]?.value ?? "");
  const [text, setText] = useState("");

  const noteRequired = note ? Boolean(note.required || (note.requiredFor && note.requiredFor.includes(selected))) : false;

  function reset(o: boolean) {
    if (busy) return;
    setOpen(o);
    if (o) {
      setError(null);
      setFields({});
      setText("");
      setSelected(choice?.defaultValue ?? choice?.options[0]?.value ?? "");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    if (note && noteRequired && text.trim().length < 3) {
      setFields({ [note.name]: "Add a short note (at least 3 characters)" });
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { ...body };
      if (choice) payload[choice.name] = selected;
      if (note) payload[note.name] = text.trim() || null;
      await api(endpoint, { method, body: method === "DELETE" ? undefined : payload });
      toast.success(success);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.message);
      if (e2.fields) setFields(e2.fields);
    } finally {
      setBusy(false);
    }
  }

  const formId = `action-${endpoint.replace(/[^a-z0-9]+/gi, "-")}-${label.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => reset(true)} disabled={disabled} title={disabled ? disabledReason : undefined} className={className}>
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={reset}
        title={title}
        description={description}
        size="sm"
        locked={busy}
        footer={
          <>
            <Button variant="ghost" onClick={() => reset(false)} disabled={busy}>
              Cancel
            </Button>
            <button
              type="submit"
              form={formId}
              disabled={busy}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-60",
                tone === "danger" ? "bg-danger text-white hover:bg-danger/90" : "bg-ink text-bg hover:bg-ink/90",
              )}
            >
              {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-e-transparent" aria-hidden />}
              {confirmLabel}
            </button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-4 pt-1" noValidate>
          <FormError message={error} />
          {choice && (
            <Field label={choice.label} hint={choice.options.find((o) => o.value === selected)?.description ?? choice.hint} error={fields[choice.name]}>
              {(p) => (
                <Select {...p} value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {choice.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {note && (
            <Field label={note.label} optional={!noteRequired} hint={note.hint} error={fields[note.name]}>
              {(p) => <Textarea {...p} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={note.placeholder} maxLength={note.maxLength ?? 1000} />}
            </Field>
          )}
        </form>
      </Dialog>
    </>
  );
}
