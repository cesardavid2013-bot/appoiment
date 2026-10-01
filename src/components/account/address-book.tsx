"use client";

import { MapPin, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api";

export type SavedAddress = { id: string; label: string; line1: string; line2: string | null; city: string; region: string | null; postalCode: string | null; country: string };

const EMPTY = { label: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "US" };

export function formatAddress(a: Pick<SavedAddress, "line1" | "line2" | "city" | "region" | "postalCode">) {
  return [a.line1, a.line2, [a.city, [a.region, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
}

export function AddressBook({ initial, countries, max }: { initial: SavedAddress[]; countries: { code: string; name: string }[]; max: number }) {
  const [items, setItems] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<SavedAddress | null>(null);
  const [deleting, setDeleting] = useState(false);
  const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  const full = items.length >= max;

  function openAdd() {
    setForm({ ...EMPTY, label: items.length === 0 ? "Home" : "" });
    setError(null);
    setFields({});
    setAdding(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      const row = await api<SavedAddress>("/api/me/addresses", { body: form });
      setItems((prev) => [...prev, row]);
      setAdding(false);
      toast.success("Address saved");
    } catch (err) {
      const e2 = err as ApiError;
      setFields(e2.fields ?? {});
      setError(e2.fields ? "Please check the highlighted fields." : e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setDeleting(true);
    try {
      await api(`/api/me/addresses/${removing.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((a) => a.id !== removing.id));
      setRemoving(null);
      toast.success("Address removed");
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setDeleting(false);
    }
  }

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      {items.length === 0 ? (
        <EmptyState
          className="rounded-xl border border-dashed border-line-strong"
          icon={<MapPin />}
          title="No saved addresses"
          description="Keep the places you book mobile services at — like home or the office — handy in one place."
          action={
            <Button onClick={openAdd} icon={<Plus className="size-4" />} className="h-11 sm:h-10">
              Add an address
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {items.map((a) => (
              <li key={a.id} className="flex items-start gap-3.5 px-4 py-4 sm:px-5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <MapPin className="size-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-ink">{a.label}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-3">
                    {formatAddress(a)}
                    <br />
                    {countryName(a.country)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="-me-2 size-11 shrink-0 sm:size-10" onClick={() => setRemoving(a)} aria-label={`Remove ${a.label}`}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-ink-3">
              {items.length} of {max} saved
            </p>
            <Button variant="secondary" onClick={openAdd} disabled={full} icon={<Plus className="size-4" />} className="h-11 sm:h-10">
              Add an address
            </Button>
          </div>
          {full && <p className="mt-2 text-[13px] text-ink-3">You&apos;ve reached the limit. Remove an address to add another.</p>}
        </>
      )}

      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Add an address"
        description="Private to you. A professional only sees an address when you book a service there."
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="address-form" loading={saving}>
              Save address
            </Button>
          </>
        }
      >
        <form id="address-form" onSubmit={save} noValidate className="space-y-4 pt-1">
          <FormError message={error} />
          <Field label="Name" hint="For example Home, Work or Gym." error={fields.label}>
            {(p) => <Input {...p} value={form.label} onChange={set("label")} maxLength={40} required />}
          </Field>
          <Field label="Street address" error={fields.line1}>
            {(p) => <Input {...p} value={form.line1} onChange={set("line1")} autoComplete="address-line1" maxLength={120} required />}
          </Field>
          <Field label="Apartment, suite or floor" optional error={fields.line2}>
            {(p) => <Input {...p} value={form.line2} onChange={set("line2")} autoComplete="address-line2" maxLength={120} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" error={fields.city}>
              {(p) => <Input {...p} value={form.city} onChange={set("city")} autoComplete="address-level2" maxLength={80} required />}
            </Field>
            <Field label="State / region" optional error={fields.region}>
              {(p) => <Input {...p} value={form.region} onChange={set("region")} autoComplete="address-level1" maxLength={80} />}
            </Field>
            <Field label="Postal code" optional error={fields.postalCode}>
              {(p) => <Input {...p} value={form.postalCode} onChange={set("postalCode")} autoComplete="postal-code" maxLength={20} />}
            </Field>
            <Field label="Country" error={fields.country}>
              {(p) => (
                <Select {...p} value={form.country} onChange={set("country")} autoComplete="country">
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={removing != null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove “${removing?.label ?? ""}”?`}
        description="Bookings you've already made at this address aren't affected."
        confirmLabel="Remove address"
        onConfirm={remove}
        loading={deleting}
      />
    </div>
  );
}
