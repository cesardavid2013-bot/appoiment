"use client";

import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-52 rounded-lg border border-line bg-surface p-1.5 shadow-lg data-[state=open]:animate-rise", className)}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, danger, icon }: { children: ReactNode; onSelect?: () => void; danger?: boolean; icon?: ReactNode }) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn(
        "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-sm outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-ink-3",
        danger ? "text-danger [&_svg]:text-danger" : "text-ink",
      )}
    >
      {icon}
      {children}
    </M.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-ink-3">{children}</M.Label>;
}

export function MenuSeparator() {
  return <M.Separator className="my-1.5 h-px bg-line" />;
}
