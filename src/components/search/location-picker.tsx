"use client";

import { LocateFixed, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { saveLocationCookie, type SavedLocation } from "@/lib/location";

/**
 * Location input with "Use my location" and place suggestions.
 * Geolocation is only requested when the user asks, and denial is handled
 * with a clear message — search always works without a location.
 */
export function LocationPicker({ value, onChange, className, compact }: { value: SavedLocation | null; onChange: (loc: SavedLocation | null) => void; className?: string; compact?: boolean }) {
  const [text, setText] = useState(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<SavedLocation[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value?.label ?? ""), [value?.label]);

  useEffect(() => {
    if (!open || text.trim().length < 2 || text === value?.label) {
      setPlaces([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<SavedLocation[]>(`/api/places?q=${encodeURIComponent(text.trim())}`, { signal: ctrl.signal })
        .then(setPlaces)
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, open, value?.label]);

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
    setText(loc?.label ?? "");
    setOpen(false);
    setStatus(null);
  }

  function useMine() {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser can't share location. Type a city instead.");
      return;
    }
    setLocating(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        choose({ label: "Current location", lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000 });
      },
      (err) => {
        setLocating(false);
        setStatus(err.code === err.PERMISSION_DENIED ? "Location is turned off for this site. Type a city instead — or allow location in your browser settings." : "We couldn't get your location. Type a city instead.");
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
          placeholder="Anywhere"
          aria-label="Location"
          className={cn("h-full min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-3 focus:outline-none", compact ? "text-sm" : "text-[15px]")}
        />
        {value && (
          <button type="button" onClick={() => choose(null)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Clear location">
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 min-w-64 overflow-hidden rounded-lg border border-line bg-surface p-1.5 shadow-lg animate-rise">
          <button type="button" onClick={useMine} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface-2">
            <LocateFixed className="size-4 text-accent" />
            {locating ? "Finding you…" : "Use my current location"}
          </button>
          {places.map((p) => (
            <button key={`${p.label}-${p.lat}`} type="button" onClick={() => choose(p)} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-2">
              <MapPin className="size-4 text-ink-3" />
              {p.label}
            </button>
          ))}
          {status && <p className="px-3 py-2 text-[13px] leading-snug text-ink-3">{status}</p>}
        </div>
      )}
    </div>
  );
}
