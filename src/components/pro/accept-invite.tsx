"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-3">
      <FormError message={error} />
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/api/invites/${encodeURIComponent(token)}/accept`, { body: {} });
            router.replace("/pro/today");
            router.refresh();
          } catch (err) {
            setError((err as ApiError).message);
            setBusy(false);
          }
        }}
      >
        Accept and open my schedule
      </Button>
    </div>
  );
}
