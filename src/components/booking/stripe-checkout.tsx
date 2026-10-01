"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementLocale } from "@stripe/stripe-js";
import { Lock } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/field";
import { useLocale, useT } from "@/i18n/client";

const STRIPE_LOCALES = new Set<string>(["ar", "de", "el", "en", "es", "fil", "fr", "he", "id", "it", "ja", "ko", "ms", "nl", "pl", "pt", "ro", "ru", "sv", "th", "tr", "vi", "zh", "zh-TW"]);

const cache = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string) {
  if (!cache.has(key)) cache.set(key, loadStripe(key));
  return cache.get(key)!;
}

function PayForm({ amountLabel, returnUrl }: { amountLabel: string; returnUrl: string }) {
  const t = useT("booking.checkout");
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    // Card details go straight to Stripe — they never touch our servers.
    const { error: err } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
    if (err) {
      setError(err.type === "card_error" || err.type === "validation_error" ? (err.message ?? t("declined")) : t("failed"));
      setPaying(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <PaymentElement options={{ layout: "tabs" }} />
      <Button type="submit" size="lg" className="w-full" loading={paying} disabled={!stripe}>
        {t("pay", { amount: amountLabel })}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-3">
        <Lock className="size-3.5" /> {t("secured")}
      </p>
    </form>
  );
}

export default function StripeCheckout({ clientSecret, publishableKey, amountLabel, returnUrl, onClose }: { clientSecret: string; publishableKey: string; amountLabel: string; returnUrl: string; onClose: () => void }) {
  const t = useT("booking.checkout");
  const { locale } = useLocale();
  const promise = useMemo(() => stripeFor(publishableKey), [publishableKey]);
  // Card fields and Stripe's own error messages follow the site language when Stripe speaks it.
  const stripeLocale: StripeElementLocale = STRIPE_LOCALES.has(locale) ? (locale as StripeElementLocale) : "auto";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t("title")} description={t("description")}>
      <Elements stripe={promise} options={{ clientSecret, locale: stripeLocale, appearance: { theme: "stripe", variables: { borderRadius: "8px", fontFamily: "inherit" } } }}>
        <PayForm amountLabel={amountLabel} returnUrl={returnUrl} />
      </Elements>
    </Dialog>
  );
}
