import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom theme tokens so conflicting classes resolve correctly.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ["bg", "surface", "surface-2", "surface-3", "ink", "ink-2", "ink-3", "line", "line-strong", "accent", "accent-ink", "accent-soft", "accent-text", "gold", "gold-soft", "gold-text", "warn", "warn-soft", "danger", "danger-soft", "info", "info-soft", "overlay"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
