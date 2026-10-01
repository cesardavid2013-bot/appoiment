import { MobileTabBar, SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { shellViewer } from "@/server/viewer";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const viewer = await shellViewer();
  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar viewer={viewer} />
    </>
  );
}
