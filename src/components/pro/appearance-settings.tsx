"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, X } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { ACCENT_TONES, ACCENTS, HIDEABLE_SECTIONS, MASTHEADS, MAX_LINKS, MAX_NOTICE, type Accent, type Masthead, type MovableSection, type ProfileTheme } from "@/domain/profile-theme";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { SaveBar, useSettingsForm } from "./settings-form";
import { SettingsCard } from "./settings-shell";

type Draft = { masthead: Masthead; accent: Accent; order: MovableSection[]; hidden: MovableSection[]; notice: string; links: { label: string; url: string }[] };

const toDraft = (t: ProfileTheme): Draft => ({ ...t, notice: t.notice ?? "" });

export function AppearanceSettings({ initial, businessName }: { initial: ProfileTheme; businessName: string }) {
  const t = useT("proSettings");
  const form = useSettingsForm<Draft>(toDraft(initial), "/api/pro/business/theme", t("appearance.saved"));
  const v = form.values;
  const hideable = (s: MovableSection) => (HIDEABLE_SECTIONS as readonly string[]).includes(s);
  const move = (i: number, d: -1 | 1) => {
    const next = [...v.order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    form.set("order", next);
  };
  const toggle = (s: MovableSection) => form.set("hidden", v.hidden.includes(s) ? v.hidden.filter((x) => x !== s) : [...v.hidden, s]);
  const setLink = (i: number, patch: Partial<{ label: string; url: string }>) => form.set("links", v.links.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <>
      <SettingsCard id="masthead-h" title={t("appearance.masthead.title")} description={t("appearance.masthead.body")}>
        <div role="radiogroup" aria-labelledby="masthead-h" className="grid gap-3 sm:grid-cols-2">
          {MASTHEADS.map((m) => {
            const on = v.masthead === m;
            const tone = ACCENT_TONES[v.accent][m === "noir" ? "dark" : "light"];
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => form.set("masthead", m)}
                className={cn("overflow-hidden rounded-lg border text-start transition-colors", on ? "border-ink ring-2 ring-ink/10" : "border-line hover:border-line-strong")}
              >
                <span className="block px-4 pb-4 pt-5" style={{ background: m === "noir" ? "#0e0d0b" : "#f6f2ea" }}>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: tone.goldText }}>
                    {t("appearance.masthead.sample")}
                  </span>
                  <span className="mt-2 block font-display text-[26px] leading-none" style={{ color: m === "noir" ? "#f3ede2" : "#14120e" }}>
                    {businessName}
                  </span>
                  <span className="mt-3 block h-px w-10" style={{ background: tone.gold }} />
                </span>
                <span className="block border-t border-line px-4 py-2.5 text-sm font-medium text-ink">{t(`appearance.masthead.${m}`)}</span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard id="accent-h" title={t("appearance.accent.title")} description={t("appearance.accent.body")}>
        <div role="radiogroup" aria-labelledby="accent-h" className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={v.accent === a}
              onClick={() => form.set("accent", a)}
              className={cn("flex items-center gap-2.5 rounded-full border py-1.5 pe-4 ps-1.5 text-sm font-medium text-ink", v.accent === a ? "border-ink ring-2 ring-ink/10" : "border-line hover:border-line-strong")}
            >
              <span className="size-7 rounded-full" style={{ background: ACCENT_TONES[a].swatch }} aria-hidden />
              {t(`appearance.accent.names.${a}`)}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard id="sections-h" title={t("appearance.sections.title")} description={t("appearance.sections.body")}>
        <ul className="divide-y divide-line rounded-lg border border-line">
          <li className="flex items-center gap-3 px-4 py-3 text-sm text-ink-3">
            <span className="flex-1 font-medium text-ink">{t("appearance.sections.names.services")}</span>
            <span>{t("appearance.sections.alwaysFirst")}</span>
          </li>
          {v.order.map((s, i) => {
            const hidden = v.hidden.includes(s);
            return (
              <li key={s} className="flex items-center gap-2 px-4 py-2.5">
                <span className={cn("flex-1 text-sm font-medium", hidden ? "text-ink-3 line-through" : "text-ink")}>{t(`appearance.sections.names.${s}`)}</span>
                {hideable(s) ? (
                  <button type="button" onClick={() => toggle(s)} aria-pressed={hidden} aria-label={t(hidden ? "appearance.sections.show" : "appearance.sections.hide", { name: t(`appearance.sections.names.${s}`) })} className="flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
                    {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                ) : (
                  <span className="px-2 text-xs text-ink-3">{t("appearance.sections.always")}</span>
                )}
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("appearance.sections.up", { name: t(`appearance.sections.names.${s}`) })} className="flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === v.order.length - 1} aria-label={t("appearance.sections.down", { name: t(`appearance.sections.names.${s}`) })} className="flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </SettingsCard>

      <SettingsCard id="notice-h" title={t("appearance.notice.title")} description={t("appearance.notice.body")}>
        <Field label={t("appearance.notice.label")} hint={`${v.notice.length}/${MAX_NOTICE}`} optional>
          {(p) => <Input {...p} value={v.notice} maxLength={MAX_NOTICE} onChange={(e) => form.set("notice", e.target.value)} placeholder={t("appearance.notice.placeholder")} />}
        </Field>
      </SettingsCard>

      <SettingsCard id="links-h" title={t("appearance.links.title")} description={t("appearance.links.body")}>
        {form.errors.links && <p className="text-sm text-danger">{form.errors.links}</p>}
        <ul className="space-y-3">
          {v.links.map((l, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
              <Input aria-label={t("appearance.links.label")} value={l.label} maxLength={40} placeholder={t("appearance.links.labelPlaceholder")} onChange={(e) => setLink(i, { label: e.target.value })} />
              <Input aria-label={t("appearance.links.url")} value={l.url} inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="https://" onChange={(e) => setLink(i, { url: e.target.value })} />
              <button type="button" onClick={() => form.set("links", v.links.filter((_, k) => k !== i))} aria-label={t("appearance.links.remove")} className="flex size-11 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-danger md:size-10">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        {v.links.length < MAX_LINKS && (
          <button type="button" onClick={() => form.set("links", [...v.links, { label: "", url: "" }])} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3.5 text-sm font-medium text-ink-2 hover:border-ink hover:text-ink">
            <Plus className="size-4" /> {t("appearance.links.add")}
          </button>
        )}
      </SettingsCard>

      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => form.save(() => ({ ...v, notice: v.notice.trim() || null, links: v.links.filter((l) => l.label.trim() || l.url.trim()) }))} onDiscard={form.discard} />
      {form.error && <p className="text-sm text-danger">{form.error}</p>}
    </>
  );
}
