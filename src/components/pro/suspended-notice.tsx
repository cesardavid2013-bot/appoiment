"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

/** Shown in place of the console when the active business is suspended by Kept. */
export function SuspendedNotice({ name, others }: { name: string; others: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Logo />
        <h1 className="mt-14 font-display text-4xl leading-tight text-ink">{name} is suspended</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-3">
          Kept has paused this business. It doesn&rsquo;t appear in search, can&rsquo;t take bookings, and the business tools are unavailable until the suspension is lifted. Customers with existing appointments can still see and cancel them.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <ButtonLink href="/support/new?category=account">Contact support</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Go to Kept
          </ButtonLink>
        </div>
        {others.length > 0 && (
          <div className="mt-10 border-t border-line pt-6">
            <p className="text-sm font-medium text-ink">Your other businesses</p>
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
                    Open {o.name}
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
