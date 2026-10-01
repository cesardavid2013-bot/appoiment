"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

export function ConnectStripeButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await api<{ url: string }>("/api/pro/payments/connect", { body: {} });
          window.location.assign(url);
        } catch (err) {
          toast.error((err as ApiError).message);
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
