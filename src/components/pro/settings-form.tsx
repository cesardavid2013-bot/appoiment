"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

/**
 * Shared state for a settings page with one save: tracks edits against the
 * last saved values, sends only what changed, warns before leaving with edits.
 */
export function useSettingsForm<T extends Record<string, unknown>>(initial: T, endpoint: string, successMessage = "Saved") {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const changed = useMemo(() => {
    const out: Partial<T> = {};
    for (const k of Object.keys(values) as (keyof T)[]) if (JSON.stringify(values[k]) !== JSON.stringify(saved[k])) out[k] = values[k];
    return out;
  }, [values, saved]);
  const dirty = Object.keys(changed).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return {
    values,
    set: <K extends keyof T>(k: K, v: T[K]) => setValues((s) => ({ ...s, [k]: v })),
    dirty,
    saving,
    errors,
    error,
    discard: () => setValues(saved),
    async save(transform?: (c: Partial<T>) => Record<string, unknown>) {
      setSaving(true);
      setErrors({});
      setError(null);
      try {
        await api(endpoint, { method: "PUT", body: transform ? transform(changed) : changed });
        setSaved(values);
        toast.success(successMessage);
        router.refresh();
      } catch (err) {
        const e = err as ApiError;
        setErrors(e.fields ?? {});
        setError(e.fields ? "Check the highlighted fields." : e.message);
      } finally {
        setSaving(false);
      }
    },
  };
}

export function SaveBar({ dirty, saving, onSave, onDiscard, idle }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; idle?: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface lg:bottom-0 lg:left-[248px]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
        <p className="min-w-0 truncate text-sm text-ink-3" aria-live="polite">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : (idle ?? "All changes saved")}
        </p>
        <div className="flex shrink-0 gap-2">
          {dirty && (
            <Button variant="ghost" onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button onClick={onSave} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
