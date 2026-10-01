"use client";

import { Check, LocateFixed, MapPin, Monitor, MoreHorizontal, Plus, Search, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceCard } from "@/components/ui/controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge } from "@/components/ui/misc";
import { useLocale, useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import type { TFunction } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";

type Kind = "physical" | "mobile" | "virtual";

export type ManagedLocation = {
  id: string;
  name: string;
  kind: Kind;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  serviceRadiusKm: number | null;
  timezone: string;
  phone: string | null;
  instructions: string | null;
  isPrimary: boolean;
  usage: { upcoming: number; members: number; services: number; exclusiveServices: string[] };
};

/** Labels live in messages under `proSettings.locations.kinds.<kind>`. */
const KIND_ICONS: Record<Kind, typeof Store> = { physical: Store, mobile: MapPin, virtual: Monitor };
const KINDS = Object.keys(KIND_ICONS) as Kind[];

const RADII = [5, 10, 15, 25, 40, 60, 100, 150];

function summary(t: TFunction, l: Pick<ManagedLocation, "kind" | "line1" | "line2" | "city" | "region" | "postalCode" | "serviceRadiusKm">) {
  if (l.kind === "physical") return [l.line1, l.line2, [l.city, l.region].filter(Boolean).join(", "), l.postalCode].filter(Boolean).join(", ");
  if (l.kind === "mobile") return t("locations.summary.mobile", { km: l.serviceRadiusKm, place: [l.city, l.region].filter(Boolean).join(", ") });
  return t("locations.summary.virtual");
}

function payload(l: Omit<ManagedLocation, "id" | "usage">) {
  return {
    name: l.name,
    kind: l.kind,
    line1: l.line1,
    line2: l.line2,
    city: l.city,
    region: l.region,
    postalCode: l.postalCode,
    country: l.country,
    lat: l.lat,
    lng: l.lng,
    serviceRadiusKm: l.serviceRadiusKm,
    timezone: l.timezone,
    phone: l.phone,
    instructions: l.instructions,
    isPrimary: l.isPrimary,
  };
}

export function LocationsManager({ locations, businessTimezone, maxLocations, planLabel, geocoding }: { locations: ManagedLocation[]; businessTimezone: string; maxLocations: number; planLabel: string; geocoding: boolean }) {
  const router = useRouter();
  const t = useT("proSettings");
  const { intl } = useLocale();
  const [editing, setEditing] = useState<ManagedLocation | "new" | null>(null);
  const [removing, setRemoving] = useState<ManagedLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const atLimit = locations.length >= maxLocations;

  async function makePrimary(l: ManagedLocation) {
    try {
      await api(`/api/pro/locations/${l.id}`, { method: "PUT", body: payload({ ...l, isPrimary: true }) });
      toast.success(t("locations.toasts.primary", { name: l.name }));
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/api/pro/locations/${removing.id}`, { method: "DELETE" });
      toast.success(t("locations.toasts.removed", { name: removing.name }));
      setRemoving(null);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const blockers = removing ? removalBlockers(t, intl, removing, locations.length) : [];

  return (
    <>
      <section aria-labelledby="locations-h" className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
          <h2 id="locations-h" className="text-base font-semibold text-ink">
            {t("locations.list.title")}
          </h2>
          <p className="text-[13px] text-ink-3 tabular">{t("locations.list.count", { count: locations.length, max: maxLocations, plan: planLabel })}</p>
        </div>
        {locations.length === 0 ? (
          <div className="px-5 py-8 sm:px-6">
            <p className="text-sm font-medium text-ink">{t("locations.list.emptyTitle")}</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-3">{t("locations.list.emptyBody")}</p>
            <Button className="mt-4" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              {t("locations.list.add")}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {locations.map((l) => {
              const Icon = KIND_ICONS[l.kind];
              return (
                <li key={l.id} className="flex items-start gap-3 py-3.5 ps-5 pe-2 sm:ps-6 sm:pe-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
                  <button type="button" onClick={() => setEditing(l)} className="min-w-0 flex-1 text-start">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-medium text-ink">{l.name}</span>
                      {l.isPrimary && <Badge tone="accent">{t("locations.list.primary")}</Badge>}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-2">{summary(t, l)}</span>
                    <span className="mt-1 block text-[13px] text-ink-3 tabular">
                      {[
                        t(`locations.kinds.${l.kind}.label`),
                        l.usage.upcoming ? t("locations.list.upcoming", { count: l.usage.upcoming }) : null,
                        l.timezone !== businessTimezone ? l.timezone.replace(/_/g, " ") : null,
                        l.kind !== "virtual" && l.lat == null ? t("locations.list.notPinned") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                  <Menu>
                    <MenuTrigger className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={t("locations.list.actions", { name: l.name })}>
                      <MoreHorizontal className="size-5" />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setEditing(l)}>{t("locations.list.edit")}</MenuItem>
                      {!l.isPrimary && <MenuItem onSelect={() => makePrimary(l)}>{t("locations.list.makePrimary")}</MenuItem>}
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => setRemoving(l)}>
                        {t("locations.list.remove")}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </li>
              );
            })}
          </ul>
        )}
        {locations.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-[13px] text-ink-3">{atLimit ? t("locations.list.atLimit", { count: maxLocations, plan: planLabel }) : t("locations.list.primaryHint")}</p>
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")} disabled={atLimit} className="shrink-0">
              {t("locations.list.add")}
            </Button>
          </div>
        )}
      </section>

      {editing && (
        <LocationDialog
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          businessTimezone={businessTimezone}
          geocoding={geocoding}
          isFirst={locations.length === 0}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {removing && blockers.length > 0 ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={t("locations.remove.blockedTitle", { name: removing.name })}
          size="sm"
          footer={
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t("locations.remove.ok")}
            </Button>
          }
        >
          <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed text-ink-2">
            {blockers.map((b) => (
              <li key={b.key}>{b.node}</li>
            ))}
          </ul>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={Boolean(removing)}
          onOpenChange={(o) => !o && setRemoving(null)}
          title={t("locations.remove.title", { name: removing?.name ?? "" })}
          confirmLabel={t("locations.remove.confirm")}
          loading={busy}
          onConfirm={remove}
          description={t("locations.remove.description")}
        >
          {removing && (removing.isPrimary || removing.usage.members > 0 || removing.usage.services > 0) && (
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-ink-2">
              {removing.isPrimary && <li>{t("locations.remove.primaryNote")}</li>}
              {removing.usage.members > 0 && <li>{t("locations.remove.membersNote", { count: removing.usage.members })}</li>}
              {removing.usage.services > 0 && <li>{t("locations.remove.servicesNote")}</li>}
            </ul>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function removalBlockers(t: TFunction, intl: string, l: ManagedLocation, activeCount: number) {
  const out: { key: string; node: React.ReactNode }[] = [];
  if (activeCount <= 1) out.push({ key: "last", node: t("locations.remove.onlyLocation") });
  if (l.usage.upcoming > 0)
    out.push({
      key: "upcoming",
      node: rich(t("locations.remove.upcoming", { count: l.usage.upcoming }), {
        link: (c) => (
          <Link href="/pro/calendar" className="font-medium text-ink underline underline-offset-2">
            {c}
          </Link>
        ),
      }),
    });
  if (l.usage.exclusiveServices.length) {
    const names = new Intl.ListFormat(intl, { type: "conjunction" }).format(l.usage.exclusiveServices.map((name) => t("locations.remove.quoted", { name })));
    out.push({
      key: "services",
      node: rich(t("locations.remove.exclusive", { count: l.usage.exclusiveServices.length, names }), {
        link: (c) => (
          <Link href="/pro/services" className="font-medium text-ink underline underline-offset-2">
            {c}
          </Link>
        ),
      }),
    });
  }
  return out;
}

type Draft = {
  kind: Kind;
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  radius: string;
  timezone: string;
  phone: string;
  instructions: string;
  isPrimary: boolean;
  coords: { lat: number; lng: number } | null;
};

function LocationDialog({ initial, businessTimezone, geocoding, isFirst, onClose, onSaved }: { initial: ManagedLocation | null; businessTimezone: string; geocoding: boolean; isFirst: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useT("proSettings");
  const [d, setD] = useState<Draft>(() => ({
    kind: initial?.kind ?? "physical",
    name: initial?.name ?? "",
    line1: initial?.line1 ?? "",
    line2: initial?.line2 ?? "",
    city: initial?.city ?? "",
    region: initial?.region ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "US",
    radius: String(initial?.serviceRadiusKm ?? 15),
    timezone: initial?.timezone ?? businessTimezone,
    phone: initial?.phone ?? "",
    instructions: initial?.instructions ?? "",
    isPrimary: initial?.isPrimary ?? isFirst,
    coords: initial?.lat != null && initial.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  }));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinStatus, setPinStatus] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ label: string; lat: number; lng: number }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const zones = useMemo(() => {
    try {
      const all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
      return all.includes(d.timezone) ? all : [d.timezone, ...all];
    } catch {
      return [d.timezone];
    }
  }, [d.timezone]);
  const radii = RADII.includes(Number(d.radius)) ? RADII : [...RADII, Number(d.radius)].sort((a, b) => a - b);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setPinStatus(t("locations.pin.noGeolocation"));
      return;
    }
    setLocating(true);
    setPinStatus(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set("coords", { lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
        setPinStatus(t("locations.pin.here"));
      },
      () => {
        setLocating(false);
        setPinStatus(t("locations.pin.denied"));
      },
      { timeout: 8000 },
    );
  }

  async function lookUp() {
    const q = [d.kind === "physical" ? d.line1 : null, d.city, d.region, d.kind === "physical" ? d.postalCode : null, d.country].filter((x) => x && x.trim()).join(", ");
    if (q.length < 2) {
      setPinStatus(t("locations.pin.enterAddress"));
      return;
    }
    setSearching(true);
    setPinStatus(null);
    try {
      const res = await api<{ label: string; lat: number; lng: number }[]>(`/api/places?q=${encodeURIComponent(q.slice(0, 100))}`);
      setMatches(res);
      if (!res.length) setPinStatus(t("locations.pin.noMatch"));
    } catch (err) {
      setPinStatus((err as ApiError).message);
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFields({});
    const body = {
      name: d.name.trim() || (d.kind === "mobile" ? t("locations.dialog.defaultMobile") : d.kind === "virtual" ? t("locations.dialog.defaultVirtual") : ""),
      kind: d.kind,
      line1: d.line1 || null,
      line2: d.line2 || null,
      city: d.city || null,
      region: d.region || null,
      postalCode: d.postalCode || null,
      country: d.country.trim().toUpperCase() || null,
      lat: d.kind === "virtual" ? null : (d.coords?.lat ?? null),
      lng: d.kind === "virtual" ? null : (d.coords?.lng ?? null),
      serviceRadiusKm: d.kind === "mobile" ? Number(d.radius) : null,
      timezone: d.timezone,
      phone: d.phone || null,
      instructions: d.instructions || null,
      isPrimary: d.isPrimary,
    };
    try {
      await api(initial ? `/api/pro/locations/${initial.id}` : "/api/pro/locations", { method: initial ? "PUT" : "POST", body });
      toast.success(initial ? t("locations.toasts.saved") : t("locations.toasts.added"));
      onSaved();
    } catch (err) {
      const e = err as ApiError;
      setFields(e.fields ?? {});
      setError(e.fields && Object.keys(e.fields).length ? null : e.message);
      setSaving(false);
    }
  }

  const instructionsCopy = {
    label: t(`locations.instructions.${d.kind}.label`),
    placeholder: t(`locations.instructions.${d.kind}.placeholder`),
    hint: t(`locations.instructions.${d.kind}.hint`),
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      size="lg"
      locked={saving}
      title={initial ? t("locations.dialog.editTitle", { name: initial.name }) : t("locations.dialog.addTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("locations.dialog.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {initial ? t("locations.dialog.save") : t("locations.dialog.add")}
          </Button>
        </>
      }
    >
      <div className="space-y-5 pt-1">
        <FormError message={error} />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{t("locations.dialog.where")}</legend>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <ChoiceCard key={k} selected={d.kind === k} onClick={() => set("kind", k)} title={t(`locations.kinds.${k}.label`)} description={t(`locations.kinds.${k}.description`)} />
            ))}
          </div>
        </fieldset>

        <Field label={t("locations.dialog.name")} hint={d.kind === "physical" ? t("locations.dialog.nameHintPhysical") : t("locations.dialog.nameHintOther")} error={fields.name}>
          {(p) => (
            <Input
              {...p}
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={80}
              placeholder={d.kind === "physical" ? t("locations.dialog.namePlaceholderPhysical") : d.kind === "mobile" ? t("locations.dialog.defaultMobile") : t("locations.dialog.defaultVirtual")}
            />
          )}
        </Field>

        {d.kind === "physical" && (
          <>
            <Field label={t("locations.dialog.street")} error={fields.line1}>
              {(p) => <Input {...p} value={d.line1} onChange={(e) => set("line1", e.target.value)} autoComplete="address-line1" maxLength={200} />}
            </Field>
            <Field label={t("locations.dialog.line2")} optional>
              {(p) => <Input {...p} value={d.line2} onChange={(e) => set("line2", e.target.value)} autoComplete="address-line2" maxLength={200} />}
            </Field>
          </>
        )}
        {d.kind !== "virtual" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={d.kind === "mobile" ? t("locations.dialog.cityBased") : t("locations.dialog.city")} error={fields.city}>
              {(p) => <Input {...p} value={d.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" maxLength={100} />}
            </Field>
            <Field label={t("locations.dialog.region")} optional>
              {(p) => <Input {...p} value={d.region} onChange={(e) => set("region", e.target.value)} autoComplete="address-level1" maxLength={100} />}
            </Field>
          </div>
        )}
        {d.kind !== "virtual" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {d.kind === "physical" && (
              <Field label={t("locations.dialog.postalCode")} optional>
                {(p) => <Input {...p} value={d.postalCode} onChange={(e) => set("postalCode", e.target.value)} autoComplete="postal-code" maxLength={20} />}
              </Field>
            )}
            <Field label={t("locations.dialog.country")} hint={t("locations.dialog.countryHint")} error={fields.country}>
              {(p) => <Input {...p} value={d.country} onChange={(e) => set("country", e.target.value.toUpperCase())} maxLength={2} className="uppercase" autoComplete="country" />}
            </Field>
          </div>
        )}
        {d.kind === "mobile" && (
          <Field label={t("locations.dialog.radius")} error={fields.serviceRadiusKm}>
            {(p) => (
              <Select {...p} value={d.radius} onChange={(e) => set("radius", e.target.value)}>
                {radii.map((r) => (
                  <option key={r} value={r}>
                    {t("locations.dialog.radiusOption", { km: r })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {d.kind !== "virtual" && (
          <div className="rounded-lg bg-surface-2 p-4">
            <p className="text-sm font-medium text-ink">{t("locations.pin.title")}</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-3">
              {d.kind === "physical" ? t("locations.pin.physical") : t("locations.pin.mobile")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {geocoding && (
                <Button variant="secondary" size="sm" onClick={lookUp} loading={searching} icon={<Search className="size-4" />}>
                  {t("locations.pin.find")}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={useMyLocation} loading={locating} icon={<LocateFixed className="size-4" />}>
                {t("locations.pin.useMine")}
              </Button>
              {d.coords && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    set("coords", null);
                    setPinStatus(t("locations.pin.removed"));
                  }}
                >
                  {t("locations.pin.remove")}
                </Button>
              )}
            </div>
            {matches && matches.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface" aria-label={t("locations.pin.matches")}>
                {matches.map((m) => (
                  <li key={`${m.lat},${m.lng}`}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center px-3 py-2 text-start text-sm text-ink hover:bg-surface-2"
                      onClick={() => {
                        set("coords", { lat: m.lat, lng: m.lng });
                        setMatches(null);
                        setPinStatus(t("locations.pin.pinnedTo", { place: m.label }));
                      }}
                    >
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-2" aria-live="polite">
              {d.coords && <Check className="size-4 text-accent" aria-hidden />}
              {pinStatus ?? (d.coords ? t("locations.pin.pinned") : t("locations.pin.notPinned"))}
            </p>
          </div>
        )}

        <Field label={instructionsCopy.label} optional hint={instructionsCopy.hint} error={fields.instructions}>
          {(p) => <Textarea {...p} rows={3} value={d.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={1000} placeholder={instructionsCopy.placeholder} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("locations.dialog.timezone")} hint={t("locations.dialog.timezoneHint")}>
            {(p) => (
              <Select {...p} value={d.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("locations.dialog.phone")} optional hint={t("locations.dialog.phoneHint")} error={fields.phone}>
            {(p) => <Input {...p} type="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" maxLength={40} />}
          </Field>
        </div>

        {!initial?.isPrimary && !isFirst && (
          <Checkbox checked={d.isPrimary} onCheckedChange={(v) => set("isPrimary", v)} label={t("locations.dialog.primary")} description={t("locations.dialog.primaryDescription")} />
        )}
      </div>
    </Dialog>
  );
}
