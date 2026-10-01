"use client";

import { useEffect } from "react";

/** Full-screen thread views scroll their own message list; stop the page behind them from scrolling. */
export function ScrollLock() {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, []);
  return null;
}
