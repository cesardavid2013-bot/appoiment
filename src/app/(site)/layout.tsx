import { AssistantProvider } from "@/components/assistant/assistant";
import { MobileTabBar, SiteHeader } from "@/components/shell/site-header";
import { FooterGate } from "@/components/shell/footer-gate";
import { SiteFooter } from "@/components/shell/site-footer";
import { shellViewer } from "@/server/viewer";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const viewer = await shellViewer();
  return (
    <AssistantProvider>
      <SiteHeader viewer={viewer} />
      <main id="main" className="min-h-[60vh] pb-24 md:pb-0">
        {children}
      </main>
      <FooterGate>
        <SiteFooter />
      </FooterGate>
      <MobileTabBar viewer={viewer} />
    </AssistantProvider>
  );
}
