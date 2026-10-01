import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Logo />
        <Link href="/explore" className="text-sm font-medium text-ink-3 hover:text-ink">
          Browse without an account
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px] animate-rise">{children}</div>
      </main>
    </div>
  );
}
