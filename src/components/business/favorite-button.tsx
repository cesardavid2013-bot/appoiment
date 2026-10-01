"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

export function FavoriteButton({ businessId, initial, signedIn, variant = "overlay", className }: { businessId: string; initial: boolean; signedIn: boolean; variant?: "overlay" | "plain" | "ghost"; className?: string }) {
  const [on, setOn] = useState(initial);
  const [pop, setPop] = useState(false);
  const router = useRouter();

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    const next = !on;
    setOn(next); // optimistic: harmless to revert
    if (next) setPop(true);
    try {
      await api("/api/favorites", { body: { businessId, on: next } });
      if (next) toast.success("Saved", { description: "Find it any time in Saved.", duration: 2500 });
    } catch (err) {
      setOn(!next);
      toast.error((err as Error).message);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Remove from saved" : "Save"}
      onAnimationEnd={() => setPop(false)}
      className={cn(
        "flex items-center justify-center transition-colors",
        variant === "overlay" ? "size-9 rounded-full bg-surface/90 text-ink shadow-sm backdrop-blur hover:bg-surface" : variant === "ghost" ? "size-9 rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" : "h-10 gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2",
        className,
      )}
    >
      <Heart className={cn("size-[18px]", on && "fill-[#c2410c] text-[#c2410c]", pop && "animate-pop")} />
      {variant === "plain" && (on ? "Saved" : "Save")}
    </button>
  );
}
