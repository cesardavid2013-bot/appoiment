"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Screens that behave like an app (your bookings, inbox, account) keep the marketing footer off phones. */
const APP = /^\/(bookings|messages|notifications|account|favorites|support)(\/|$)/;

export function FooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  return <div className={APP.test(pathname) ? "hidden lg:block" : undefined}>{children}</div>;
}
