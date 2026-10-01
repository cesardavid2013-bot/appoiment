"use client";

import { useState } from "react";
import { ChoiceCard } from "@/components/ui/controls";
import { formatDuration, formatMoney } from "@/domain/money";

const LENGTHS = [
  { id: "shoulder", name: "Shoulder length", price: 0, minutes: 0 },
  { id: "mid", name: "Mid-back", price: 4000, minutes: 60 },
  { id: "waist", name: "Waist length", price: 8000, minutes: 120 },
];
const ADDONS = [
  { id: "wash", name: "Wash & blow-dry", price: 2500, minutes: 30 },
  { id: "beads", name: "Beads & cuffs", price: 1500, minutes: 15 },
];
const BASE = { price: 16000, minutes: 240 };

/**
 * A working miniature of the service options customers see when booking:
 * every choice changes the price and the time blocked in the calendar.
 */
export function ServiceOptionsDemo() {
  const [length, setLength] = useState("mid");
  const [addons, setAddons] = useState<string[]>(["wash"]);
  const l = LENGTHS.find((x) => x.id === length)!;
  const chosen = ADDONS.filter((a) => addons.includes(a.id));
  const total = BASE.price + l.price + chosen.reduce((s, a) => s + a.price, 0);
  const minutes = BASE.minutes + l.minutes + chosen.reduce((s, a) => s + a.minutes, 0);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-ink">Knotless braids</p>
          <p className="text-[13px] text-ink-3">Example service · try the options</p>
        </div>
        <div className="text-end" aria-live="polite">
          <p className="text-[17px] font-semibold text-ink tabular">{formatMoney(total, "USD", { compact: true })}</p>
          <p className="text-[13px] text-ink-3 tabular">{formatDuration(minutes)}</p>
        </div>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Length</legend>
        <div role="radiogroup" aria-label="Length" className="space-y-2">
          {LENGTHS.map((o) => (
            <ChoiceCard
              key={o.id}
              selected={length === o.id}
              onClick={() => setLength(o.id)}
              title={o.name}
              aside={o.price ? `+${formatMoney(o.price, "USD", { compact: true })} · +${formatDuration(o.minutes)}` : "Included"}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Add-ons</legend>
        <div className="space-y-2">
          {ADDONS.map((o) => (
            <ChoiceCard
              key={o.id}
              role="checkbox"
              selected={addons.includes(o.id)}
              onClick={() => setAddons((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]))}
              title={o.name}
              aside={`+${formatMoney(o.price, "USD", { compact: true })} · +${formatDuration(o.minutes)}`}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
