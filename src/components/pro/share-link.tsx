"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/client";

export function ShareLink({ url }: { url: string }) {
  const t = useT("proSettings");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-surface p-1.5 ps-3">
      <span className="min-w-0 flex-1 truncate text-sm text-ink-2" dir="ltr">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-3 text-[13px] font-medium text-bg"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? t("shareLink.copied") : t("shareLink.copy")}
      </button>
    </div>
  );
}
