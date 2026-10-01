import { cn } from "@/lib/cn";

const TONES = [
  "bg-[#ece6dc] text-[#5b4a35] dark:bg-[#2a251e] dark:text-[#d9c7ad]",
  "bg-[#e3e8e1] text-[#3d5446] dark:bg-[#1f2722] dark:text-[#b7cfbf]",
  "bg-[#e8e2e4] text-[#5a4049] dark:bg-[#29212a] dark:text-[#d8bfc9]",
  "bg-[#e1e5ea] text-[#3b4b5c] dark:bg-[#1e242b] dark:text-[#b9c7d6]",
  "bg-[#ebe5d6] text-[#5c5230] dark:bg-[#29261b] dark:text-[#d6cba3]",
];

export function toneFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export function initials(name: string) {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Typographic cover for businesses without photos — calm, consistent, and
 * honest (no stock imagery pretending to be someone's work).
 */
export function MonogramCover({ name, label, className, size = "md" }: { name: string; label?: string | null; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden", toneFor(name), className)}>
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "repeating-linear-gradient(35deg, currentColor 0 1px, transparent 1px 14px)" }} aria-hidden />
      <span className={cn("relative font-display leading-none tracking-tight", size === "sm" ? "text-3xl" : size === "lg" ? "text-7xl" : "text-5xl")}>{initials(name)}</span>
      {label && <span className="absolute bottom-3 left-3.5 text-[11px] font-medium uppercase tracking-[0.08em] opacity-70">{label}</span>}
    </div>
  );
}

const NOIR = ["#15130f", "#101613", "#17110f", "#11131a", "#161510"];

/**
 * Cover for a professional without photos yet: dark stationery with a brass
 * monogram and a fine inset frame — consistent, quiet, never fake imagery.
 */
export function NoirCover({ name, label, className, size = "md" }: { name: string; label?: string | null; className?: string; size?: "sm" | "md" | "lg" }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <div className={cn("theme-noir relative flex items-center justify-center overflow-hidden", className)} style={{ background: NOIR[h % NOIR.length] }}>
      <div className="pointer-events-none absolute inset-2.5 border border-gold/25" aria-hidden />
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(80%_60%_at_50%_0%,rgb(201_168_101/0.10),transparent_70%)]" aria-hidden />
      <span className={cn("relative font-display leading-none tracking-[0.04em] text-gold-text", size === "sm" ? "text-3xl" : size === "lg" ? "text-8xl" : "text-6xl")}>{initials(name)}</span>
      {label && <span className="absolute bottom-5 left-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-3">{label}</span>}
    </div>
  );
}
