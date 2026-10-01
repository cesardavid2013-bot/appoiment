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

const KIND_META: Record<Kind, { label: string; description: string; Icon: typeof Store }> = {
  physical: { label: "At my place", description: "Shop, studio, office", Icon: Store },
  mobile: { label: "I go to clients", description: "Homes, offices, events", Icon: MapPin },
  virtual: { label: "Online", description: "Video or phone sessions", Icon: Monitor },
};

const RADII = [5, 10, 15, 25, 40, 60, 100, 150];

function summary(l: Pick<ManagedLocation, "kind" | "line1" | "line2" | "city" | "region" | "postalCode" | "serviceRadiusKm">) {
  if (l.kind === "physical") return [l.line1, l.line2, [l.city, l.region].filter(Boolean).join(", "), l.postalCode].filter(Boolean).join(", ");
  if (l.kind === "mobile") return `Travels up to ${l.serviceRadiusKm} km from ${[l.city, l.region].filter(Boolean).join(", ")}`;
  return "Online sessions";
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
  const [editing, setEditing] = useState<ManagedLocation | "new" | null>(null);
  const [removing, setRemoving] = useState<ManagedLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const atLimit = locations.length >= maxLocations;

  async function makePrimary(l: ManagedLocation) {
    try {
      await api(`/api/pro/locations/${l.id}`, { method: "PUT", body: payload({ ...l, isPrimary: true }) });
      toast.success(`${l.name} is now your primary location`);
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
      toast.success(`${removing.name} removed`);
      setRemoving(null);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const blockers = removing ? removalBlockers(removing, locations.length) : [];

  return (
    <>
      <section aria-labelledby="locations-h" className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
          <h2 id="locations-h" className="text-base font-semibold text-ink">
            Your locations
          </h2>
          <p className="text-[13px] text-ink-3 tabular">
            {locations.length} of {maxLocations} on the {planLabel} plan
          </p>
        </div>
        {locations.length === 0 ? (
          <div className="px-5 py-8 sm:px-6">
            <p className="text-sm font-medium text-ink">No locations yet</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-3">Clients can&apos;t book until they know where the appointment happens. Add your shop, the area you travel to, or online sessions.</p>
            <Button className="mt-4" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              Add location
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {locations.map((l) => {
              const { Icon } = KIND_META[l.kind];
              return (
                <li key={l.id} className="flex items-start gap-3 py-3.5 ps-5 pe-2 sm:ps-6 sm:pe-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
                  <button type="button" onClick={() => setEditing(l)} className="min-w-0 flex-1 text-start">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-medium text-ink">{l.name}</span>
                      {l.isPrimary && <Badge tone="accent">Primary</Badge>}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-2">{summary(l)}</span>
                    <span className="mt-1 block text-[13px] text-ink-3 tabular">
                      {[
                        KIND_META[l.kind].label,
                        l.usage.upcoming ? `${l.usage.upcoming} upcoming appointment${l.usage.upcoming === 1 ? "" : "s"}` : null,
                        l.timezone !== businessTimezone ? l.timezone.replace(/_/g, " ") : null,
                        l.kind !== "virtual" && l.lat == null ? "Not pinned on the map" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                  <Menu>
                    <MenuTrigger className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Actions for ${l.name}`}>
                      <MoreHorizontal className="size-5" />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setEditing(l)}>Edit</MenuItem>
                      {!l.isPrimary && <MenuItem onSelect={() => makePrimary(l)}>Make primary</MenuItem>}
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => setRemoving(l)}>
                        Remove location
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
            <p className="text-[13px] text-ink-3">{atLimit ? `Your ${planLabel} plan includes ${maxLocations} location${maxLocations === 1 ? "" : "s"}. Remove one to add another.` : "The primary location is the one shown first on your profile and in search."}</p>
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")} disabled={atLimit} className="shrink-0">
              Add location
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
          title={`${removing.name} can't be removed yet`}
          size="sm"
          footer={
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              OK
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
          title={`Remove ${removing?.name ?? "location"}?`}
          confirmLabel="Remove location"
          loading={busy}
          onConfirm={remove}
          description="Clients won't be able to book it any more. Past appointments keep their details."
        >
          {removing && (removing.isPrimary || removing.usage.members > 0 || removing.usage.services > 0) && (
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-ink-2">
              {removing.isPrimary && <li>Your oldest remaining location becomes primary.</li>}
              {removing.usage.members > 0 && (
                <li>
                  {removing.usage.members} team member{removing.usage.members === 1 ? " is" : "s are"} assigned here. Anyone assigned only here will be bookable at all your locations.
                </li>
              )}
              {removing.usage.services > 0 && <li>Services offered here keep their other locations.</li>}
            </ul>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function removalBlockers(l: ManagedLocation, activeCount: number) {
  const out: { key: string; node: React.ReactNode }[] = [];
  if (activeCount <= 1) out.push({ key: "last", node: "It's your only location. Add another one first so clients still have somewhere to book." });
  if (l.usage.upcoming > 0)
    out.push({
      key: "upcoming",
      node: (
        <>
          It has {l.usage.upcoming} upcoming appointment{l.usage.upcoming === 1 ? "" : "s"}. Move or cancel {l.usage.upcoming === 1 ? "it" : "them"} from your{" "}
          <Link href="/pro/calendar" className="font-medium text-ink underline underline-offset-2">
            calendar
          </Link>{" "}
          first.
        </>
      ),
    });
  if (l.usage.exclusiveServices.length)
    out.push({
      key: "services",
      node: (
        <>
          {l.usage.exclusiveServices.map((n) => `“${n}”`).join(", ")} {l.usage.exclusiveServices.length === 1 ? "is" : "are"} only offered here. Offer {l.usage.exclusiveServices.length === 1 ? "it" : "them"} somewhere else or hide {l.usage.exclusiveServices.length === 1 ? "it" : "them"} in{" "}
          <Link href="/pro/services" className="font-medium text-ink underline underline-offset-2">
            Services
          </Link>
          .
        </>
      ),
    });
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
      setPinStatus("This browser can't share its location.");
      return;
    }
    setLocating(true);
    setPinStatus(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set("coords", { lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
        setPinStatus("Pinned to where you are now.");
      },
      () => {
        setLocating(false);
        setPinStatus("We couldn't get your location. Check your browser's location permission.");
      },
      { timeout: 8000 },
    );
  }

  async function lookUp() {
    const q = [d.kind === "physical" ? d.line1 : null, d.city, d.region, d.kind === "physical" ? d.postalCode : null, d.country].filter((x) => x && x.trim()).join(", ");
    if (q.length < 2) {
      setPinStatus("Enter the address first.");
      return;
    }
    setSearching(true);
    setPinStatus(null);
    try {
      const res = await api<{ label: string; lat: number; lng: number }[]>(`/api/places?q=${encodeURIComponent(q.slice(0, 100))}`);
      setMatches(res);
      if (!res.length) setPinStatus("No match found. Check the address, or use your current location.");
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
      name: d.name.trim() || (d.kind === "mobile" ? "Mobile service" : d.kind === "virtual" ? "Online" : ""),
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
      toast.success(initial ? "Location saved" : "Location added");
      onSaved();
    } catch (err) {
      const e = err as ApiError;
      setFields(e.fields ?? {});
      setError(e.fields && Object.keys(e.fields).length ? null : e.message);
      setSaving(false);
    }
  }

  const instructionsCopy = {
    physical: { label: "Arrival instructions", placeholder: "e.g. Park on Elm St. Ring the buzzer for unit 2B and come up to the second floor.", hint: "Parking, entrance, buzzer code. Clients see this on your profile and in their booking." },
    mobile: { label: "Notes for clients", placeholder: "e.g. I'll need a parking spot within 50 m and access to a power outlet.", hint: "What clients should have ready. Shown in their booking." },
    virtual: { label: "How sessions work", placeholder: "e.g. You'll get a video link by message an hour before your session.", hint: "Shown in their booking. Don't paste a private meeting link here — send links in Messages." },
  }[d.kind];

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      size="lg"
      locked={saving}
      title={initial ? `Edit ${initial.name}` : "Add a location"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {initial ? "Save location" : "Add location"}
          </Button>
        </>
      }
    >
      <div className="space-y-5 pt-1">
        <FormError message={error} />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Where do appointments happen?</legend>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(KIND_META) as Kind[]).map((k) => (
              <ChoiceCard key={k} selected={d.kind === k} onClick={() => set("kind", k)} title={KIND_META[k].label} description={KIND_META[k].description} />
            ))}
          </div>
        </fieldset>

        <Field label="Name" hint={d.kind === "physical" ? "Shown to clients, e.g. the shop's name or neighbourhood." : "Shown to clients when they choose where to book."} error={fields.name}>
          {(p) => <Input {...p} value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder={d.kind === "physical" ? "e.g. Downtown studio" : d.kind === "mobile" ? "Mobile service" : "Online"} />}
        </Field>

        {d.kind === "physical" && (
          <>
            <Field label="Street address" error={fields.line1}>
              {(p) => <Input {...p} value={d.line1} onChange={(e) => set("line1", e.target.value)} autoComplete="address-line1" maxLength={200} />}
            </Field>
            <Field label="Apartment, suite, floor" optional>
              {(p) => <Input {...p} value={d.line2} onChange={(e) => set("line2", e.target.value)} autoComplete="address-line2" maxLength={200} />}
            </Field>
          </>
        )}
        {d.kind !== "virtual" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={d.kind === "mobile" ? "City you're based in" : "City"} error={fields.city}>
              {(p) => <Input {...p} value={d.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" maxLength={100} />}
            </Field>
            <Field label="State / region" optional>
              {(p) => <Input {...p} value={d.region} onChange={(e) => set("region", e.target.value)} autoComplete="address-level1" maxLength={100} />}
            </Field>
          </div>
        )}
        {d.kind !== "virtual" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {d.kind === "physical" && (
              <Field label="Postal code" optional>
                {(p) => <Input {...p} value={d.postalCode} onChange={(e) => set("postalCode", e.target.value)} autoComplete="postal-code" maxLength={20} />}
              </Field>
            )}
            <Field label="Country code" hint="Two letters, e.g. US, MX, ES" error={fields.country}>
              {(p) => <Input {...p} value={d.country} onChange={(e) => set("country", e.target.value.toUpperCase())} maxLength={2} className="uppercase" autoComplete="country" />}
            </Field>
          </div>
        )}
        {d.kind === "mobile" && (
          <Field label="How far will you travel?" error={fields.serviceRadiusKm}>
            {(p) => (
              <Select {...p} value={d.radius} onChange={(e) => set("radius", e.target.value)}>
                {radii.map((r) => (
                  <option key={r} value={r}>
                    Up to {r} km
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {d.kind !== "virtual" && (
          <div className="rounded-lg bg-surface-2 p-4">
            <p className="text-sm font-medium text-ink">Map pin</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-3">
              {d.kind === "physical"
                ? "Puts your shop on the map and in “near me” searches. Clients see the address you entered above."
                : "Used only to match you with nearby clients. Your exact pin and street address are never shown — your profile shows the city, and search places you within about 5 km."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {geocoding && (
                <Button variant="secondary" size="sm" onClick={lookUp} loading={searching} icon={<Search className="size-4" />}>
                  Find this address
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={useMyLocation} loading={locating} icon={<LocateFixed className="size-4" />}>
                Use my current location
              </Button>
              {d.coords && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    set("coords", null);
                    setPinStatus("Pin removed.");
                  }}
                >
                  Remove pin
                </Button>
              )}
            </div>
            {matches && matches.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface" aria-label="Address matches">
                {matches.map((m) => (
                  <li key={`${m.lat},${m.lng}`}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center px-3 py-2 text-start text-sm text-ink hover:bg-surface-2"
                      onClick={() => {
                        set("coords", { lat: m.lat, lng: m.lng });
                        setMatches(null);
                        setPinStatus(`Pinned to ${m.label}.`);
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
              {pinStatus ?? (d.coords ? "Pinned." : "Not pinned yet. You'll still appear when clients search your city.")}
            </p>
          </div>
        )}

        <Field label={instructionsCopy.label} optional hint={instructionsCopy.hint} error={fields.instructions}>
          {(p) => <Textarea {...p} rows={3} value={d.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={1000} placeholder={instructionsCopy.placeholder} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time zone" hint="Hours and bookings here use this zone.">
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
          <Field label="Phone" optional hint="If clients should call this location directly." error={fields.phone}>
            {(p) => <Input {...p} type="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" maxLength={40} />}
          </Field>
        </div>

        {!initial?.isPrimary && !isFirst && (
          <Checkbox checked={d.isPrimary} onCheckedChange={(v) => set("isPrimary", v)} label="Make this my primary location" description="Shown first on your profile and used for search." />
        )}
      </div>
    </Dialog>
  );
}
