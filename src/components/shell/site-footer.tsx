import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface/60 pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-ink-3">Book trusted professionals. Run your appointments with less effort.</p>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Discover</h3>
          <ul className="space-y-2 text-sm text-ink-3">
            <li><Link className="hover:text-ink" href="/explore">Explore</Link></li>
            <li><Link className="hover:text-ink" href="/explore?category=hair">Hair & barbers</Link></li>
            <li><Link className="hover:text-ink" href="/explore?category=wellness">Wellness</Link></li>
            <li><Link className="hover:text-ink" href="/explore?category=fitness">Fitness</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">For professionals</h3>
          <ul className="space-y-2 text-sm text-ink-3">
            <li><Link className="hover:text-ink" href="/for-business">How it works</Link></li>
            <li><Link className="hover:text-ink" href="/pro/onboarding">List your services</Link></li>
            <li><Link className="hover:text-ink" href="/pro">Business dashboard</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Help</h3>
          <ul className="space-y-2 text-sm text-ink-3">
            <li><Link className="hover:text-ink" href="/support">Support</Link></li>
            <li><Link className="hover:text-ink" href="/legal/terms">Terms</Link></li>
            <li><Link className="hover:text-ink" href="/legal/privacy">Privacy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-ink-3 sm:px-6 lg:px-8">© {new Date().getFullYear()} Kept. All rights reserved.</p>
      </div>
    </footer>
  );
}
