import { LegalNav } from "@/components/legal/legal";

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
      <LegalNav />
      {children}
    </div>
  );
}
