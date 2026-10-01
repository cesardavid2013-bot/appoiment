"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { useT } from "@/i18n/client";
import { RegisterServiceWorker } from "@/components/shell/register-sw";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  const t = useT("common.ui");
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <RegisterServiceWorker />
      <Toaster
        position="top-center"
        containerAriaLabel={t("notifications")}
        toastOptions={{
          classNames: {
            toast: "!rounded-lg !border !border-line !bg-surface !text-ink !shadow-lg !font-sans",
            description: "!text-ink-3",
            actionButton: "!bg-ink !text-bg",
          },
        }}
      />
    </QueryClientProvider>
  );
}
