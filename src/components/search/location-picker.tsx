"use client";

import { LocateFixed, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CURRENT_LOCATION_LABEL, saveLocationCookie, type SavedLocation } from "@/lib/location";

/**
 * Location input with "Use my location" and place suggestions.
 * Geolocation is only requested when the user asks, and denial is handled
 * with a clear message — search always works without a location.
 */
export function LocationPicker({ value, onChange, className, compact }: { value: SavedLocation | null; onChange: (loc: SavedLocation | null) => void; className?: string; compact?: boolean }) {
  const t = useT("search");
  const shown = (loc: SavedLocation | null | undefined) => (!loc ? "" : loc.label === CURRENT_LOCATION_LABEL ? t("location.current") : loc.label);
  const [text, setText] = useState(shown(value));
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<SavedLocation[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Keep the input in sync when the chosen location changes from outside.
  const [prevLabel, setPrevLabel] = useState(value?.label);
  if (value?.label !== prevLabel) {
    setPrevLabel(value?.label);
    setText(shown(value));
  }
  const searching = open && text.trim().length >= 2 && text !== shown(value);

  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api<SavedLocation[]>(`/api/places?q=${encodeURIComponent(text.trim())}`, { signal: ctrl.signal })
        .then(setPlaces)
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, searching]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(loc: SavedLocation | null) {
    onChange(loc);
    saveLocationCookie(loc);
    setText(shown(loc));
    setOpen(false);
    setStatus(null);
  }

  function useMine() {
    if (!("geolocation" in navigator)) {
      setStatus(t("location.unsupported"));
      return;
    }
    setLocating(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        choose({ label: CURRENT_LOCATION_LABEL, lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000 });
      },
      (err) => {
        setLocating(false);
        setStatus(err.code === err.PERMISSION_DENIED ? t("location.denied") : t("location.failed"));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60_000 },
    );
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex h-full items-center gap-2">
        <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("location.placeholder")}
          aria-label={t("location.label")}
          className={cn("h-full min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-3 focus:outline-none", compact ? "text-sm" : "text-[15px]")}
        />
        {value && (
          <button type="button" onClick={() => choose(null)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label={t("location.clear")}>
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute start-0 end-0 top-[calc(100%+10px)] z-30 min-w-64 overflow-hidden rounded-lg border border-line bg-surface p-1.5 shadow-lg animate-rise">
          <button type="button" onClick={useMine} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-start text-sm font-medium text-ink hover:bg-surface-2">
            <LocateFixed className="size-4 text-accent" />
            {locating ? t("location.finding") : t("location.useMine")}
          </button>
          {(searching ? places : []).map((p) => (
            <button key={`${p.label}-${p.lat}`} type="button" onClick={() => choose(p)} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-start text-sm text-ink hover:bg-surface-2">
              <MapPin className="size-4 text-ink-3" />
              {p.label}
            </button>
          ))}
          {status && (
            <p className="px-3 py-2 text-[13px] leading-snug text-ink-3" role="status">
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
