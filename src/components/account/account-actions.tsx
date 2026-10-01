"use client";

import { LogOut, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";

export function SignOutButton() {
  const router = useRouter();
  const t = useT("account");
  const [loading, setLoading] = useState(false);
  async function signOut() {
    setLoading(true);
    try {
      await api("/api/auth/logout", { body: {} });
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
      setLoading(false);
    }
  }
  return (
    <Button variant="secondary" size="lg" className="w-full" onClick={signOut} loading={loading} icon={<LogOut className="size-4" />}>
      {t("home.signOut")}
    </Button>
  );
}

/** Sends a fresh confirmation link to the user's email. */
export function ResendVerificationButton({ email, variant = "secondary" }: { email: string; variant?: "secondary" | "primary" }) {
  const t = useT("account");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  async function resend() {
    setState("sending");
    try {
      await api("/api/auth/resend-verification", { body: {} });
      setState("sent");
      toast.success(t("verify.sentToast"), { description: t("verify.sentBody", { email }) });
    } catch (err) {
      setState("idle");
      toast.error((err as ApiError).message);
    }
  }
  return (
    <Button variant={variant} size="sm" className="h-10 sm:h-8" onClick={resend} loading={state === "sending"} disabled={state === "sent"} icon={<Mail className="size-4" />}>
      {state === "sent" ? t("verify.sent") : t("verify.resend")}
    </Button>
  );
}
