"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { SavedLocation } from "@/lib/location";
import { LocationPicker } from "./location-picker";

type Suggestions = { businesses: { slug: string; name: string; city: string | null }[]; categories: { slug: string; name: string }[] };

export function HeroSearch({ initialLocation }: { initialLocation: SavedLocation | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<SavedLocation | null>(initialLocation);
  const [sugg, setSugg] = useState<Suggestions | null>(null);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => api<Suggestions>(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then(setSugg).catch(() => undefined), 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (loc) {
      params.set("lat", String(loc.lat));
      params.set("lng", String(loc.lng));
      params.set("near", loc.label);
    }
    router.push(`/explore${params.size ? `?${params}` : ""}`);
  }

  const shown = q.trim().length >= 2 ? sugg : null;
  const hasSugg = shown && (shown.businesses.length > 0 || shown.categories.length > 0);

  return (
    <form onSubmit={submit} role="search" className="relative w-full max-w-2xl">
      <div className="flex flex-col gap-0 rounded-xl border border-line-strong bg-surface p-1.5 shadow-md sm:h-16 sm:flex-row sm:items-center">
        <div ref={wrap} className="relative flex h-12 flex-1 items-center gap-2.5 px-3.5 sm:h-full">
          <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Haircut, massage, photographer…"
            aria-label="What do you want to book?"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
            autoComplete="off"
          />
          {open && hasSugg && (
            <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 overflow-hidden rounded-lg border border-line bg-surface p-1.5 text-left shadow-lg animate-rise">
              {shown!.categories.map((c) => (
                <button key={c.slug} type="button" onClick={() => router.push(`/explore?category=${c.slug}`)} className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm text-ink hover:bg-surface-2">
                  {c.name}
                  <span className="text-xs text-ink-3">Category</span>
                </button>
              ))}
              {shown!.businesses.map((b) => (
                <button key={b.slug} type="button" onClick={() => router.push(`/${b.slug}`)} className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm text-ink hover:bg-surface-2">
                  {b.name}
                  <span className="text-xs text-ink-3">{b.city}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mx-3 h-px bg-line sm:mx-0 sm:h-8 sm:w-px" aria-hidden />
        <LocationPicker value={loc} onChange={setLoc} className="h-12 px-3.5 sm:h-full sm:w-56" />
        <button type="submit" className="mt-1.5 flex h-12 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-[15px] font-medium text-bg transition-colors hover:bg-ink/90 sm:mt-0 sm:h-full">
          <Search className="size-4 sm:hidden" />
          Search
        </button>
      </div>
    </form>
  );
}
