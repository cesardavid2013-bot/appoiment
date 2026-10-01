"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";

/** Shown in place of the console when the active business is suspended by Kept. */
export function SuspendedNotice({ name, others }: { name: string; others: { id: string; name: string }[] }) {
  const router = useRouter();
  const t = useT("pro");
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Logo />
        <h1 className="mt-14 font-display text-4xl leading-tight text-ink">{t("suspended.title", { name })}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-3">
          {t("suspended.body")}
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <ButtonLink href="/support/new?category=account">{t("suspended.contactSupport")}</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            {t("suspended.goToKept")}
          </ButtonLink>
        </div>
        {others.length > 0 && (
          <div className="mt-10 border-t border-line pt-6">
            <p className="text-sm font-medium text-ink">{t("suspended.otherBusinesses")}</p>
            <ul className="mt-3 space-y-2">
              {others.map((o) => (
                <li key={o.id}>
                  <Button
                    variant="secondary"
                    loading={busy === o.id}
                    onClick={async () => {
                      setBusy(o.id);
                      try {
                        await api("/api/pro/switch", { body: { businessId: o.id } });
                        router.refresh();
                      } catch (err) {
                        toast.error((err as ApiError).message);
                        setBusy(null);
                      }
                    }}
                  >
                    {t("suspended.open", { name: o.name })}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
