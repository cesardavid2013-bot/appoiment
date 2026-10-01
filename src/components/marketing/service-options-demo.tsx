"use client";

import { useState } from "react";
import { ChoiceCard } from "@/components/ui/controls";
import { formatDuration, formatMoney } from "@/domain/money";
import { useLocale, useT } from "@/i18n/client";

const LENGTHS = [
  { id: "shoulder", price: 0, minutes: 0 },
  { id: "mid", price: 4000, minutes: 60 },
  { id: "waist", price: 8000, minutes: 120 },
];
const ADDONS = [
  { id: "wash", price: 2500, minutes: 30 },
  { id: "beads", price: 1500, minutes: 15 },
];
const BASE = { price: 16000, minutes: 240 };

/**
 * A working miniature of the service options customers see when booking:
 * every choice changes the price and the time blocked in the calendar.
 */
export function ServiceOptionsDemo() {
  const t = useT("marketing");
  const { intl } = useLocale();
  const [length, setLength] = useState("mid");
  const [addons, setAddons] = useState<string[]>(["wash"]);
  const l = LENGTHS.find((x) => x.id === length)!;
  const chosen = ADDONS.filter((a) => addons.includes(a.id));
  const total = BASE.price + l.price + chosen.reduce((s, a) => s + a.price, 0);
  const minutes = BASE.minutes + l.minutes + chosen.reduce((s, a) => s + a.minutes, 0);
  const money = (c: number) => formatMoney(c, "USD", { compact: true, intl });
  const extra = (o: { price: number; minutes: number }) => t("demo.options.extra", { price: money(o.price), duration: formatDuration(o.minutes, intl) });

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-ink">{t("demo.options.service")}</p>
          <p className="text-[13px] text-ink-3">{t("demo.options.hint")}</p>
        </div>
        <div className="shrink-0 text-end" aria-live="polite">
          <p className="text-[17px] font-semibold text-ink tabular">{money(total)}</p>
          <p className="text-[13px] text-ink-3 tabular">{formatDuration(minutes, intl)}</p>
        </div>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] font-medium text-ink-2">{t("demo.options.length")}</legend>
        <div role="radiogroup" aria-label={t("demo.options.length")} className="space-y-2">
          {LENGTHS.map((o) => (
            <ChoiceCard key={o.id} selected={length === o.id} onClick={() => setLength(o.id)} title={t(`demo.options.${o.id}`)} aside={o.price ? extra(o) : t("demo.options.included")} />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] font-medium text-ink-2">{t("demo.options.addons")}</legend>
        <div className="space-y-2">
          {ADDONS.map((o) => (
            <ChoiceCard
              key={o.id}
              role="checkbox"
              selected={addons.includes(o.id)}
              onClick={() => setAddons((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]))}
              title={t(`demo.options.${o.id}`)}
              aside={extra(o)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
