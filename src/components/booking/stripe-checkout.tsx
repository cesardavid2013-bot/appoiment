"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Lock } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/field";

const cache = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string) {
  if (!cache.has(key)) cache.set(key, loadStripe(key));
  return cache.get(key)!;
}

function PayForm({ amountLabel, returnUrl }: { amountLabel: string; returnUrl: string }) {
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
      setError(err.type === "card_error" || err.type === "validation_error" ? (err.message ?? "Your card was declined.") : "We couldn't complete the payment. Your card was not charged — please try again.");
      setPaying(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <PaymentElement options={{ layout: "tabs" }} />
      <Button type="submit" size="lg" className="w-full" loading={paying} disabled={!stripe}>
        Pay {amountLabel}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-3">
        <Lock className="size-3.5" /> Secured by Stripe. Your time is held while you pay.
      </p>
    </form>
  );
}

export default function StripeCheckout({ clientSecret, publishableKey, amountLabel, returnUrl, onClose }: { clientSecret: string; publishableKey: string; amountLabel: string; returnUrl: string; onClose: () => void }) {
  const promise = useMemo(() => stripeFor(publishableKey), [publishableKey]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Payment" description="Complete payment to confirm your booking.">
      <Elements stripe={promise} options={{ clientSecret, appearance: { theme: "stripe", variables: { borderRadius: "8px", fontFamily: "inherit" } } }}>
        <PayForm amountLabel={amountLabel} returnUrl={returnUrl} />
      </Elements>
    </Dialog>
  );
}
