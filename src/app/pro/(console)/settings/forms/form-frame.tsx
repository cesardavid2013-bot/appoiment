import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Wide frame for the form builder: the editor and the client preview sit side by side on desktop. */
export function FormFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-36 pt-6 sm:px-6 lg:px-10 lg:pb-28 lg:pt-10">
      <Link href="/pro/settings/forms" className="-ms-1 mb-3 inline-flex h-10 items-center gap-1 pe-2 text-sm font-medium text-ink-3 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
        Client questions
      </Link>
      {children}
    </div>
  );
}
