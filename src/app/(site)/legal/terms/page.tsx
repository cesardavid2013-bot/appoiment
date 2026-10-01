import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc } from "@/components/legal/doc";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The plain-language terms for using Kept to book professionals or to run your business.",
  alternates: { canonical: "/legal/terms" },
};

const sections = [
  {
    id: "what-kept-is",
    title: "What Kept is",
    body: (
      <>
        <p>
          Kept is a marketplace and booking tool. Customers use it to find and book professionals — barbers, stylists, trainers, tutors, detailers and many more. Professionals and businesses use it to
          publish their services, manage their calendar and get paid.
        </p>
        <p>
          <strong>The professional or business you book provides the service, not Kept.</strong> When you book, your agreement for the service is with that business. We run the platform that
          connects you, shows you their prices and policies, and helps both sides keep the appointment.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>You need to be at least 18 (or the age of majority where you live) to create an account. You can book for someone else, such as your child, if you&apos;re responsible for them.</li>
        <li>Give accurate information and keep it up to date — businesses rely on it to reach you about your appointments.</li>
        <li>Keep your password to yourself. You&apos;re responsible for what happens on your account. If you think someone else has access, change your password and sign out other devices in Login &amp; security.</li>
        <li>One person per account. Businesses add team members as separate people rather than sharing a login.</li>
      </ul>
    ),
  },
  {
    id: "booking",
    title: "Booking as a customer",
    body: (
      <>
        <p>Before you confirm a booking you&apos;ll see the price (or how it&apos;s estimated), how long it takes, any deposit, and the business&apos;s cancellation and no-show policy. By booking, you agree to those terms.</p>
        <ul>
          <li>
            <strong>Instant bookings</strong> are confirmed straight away. <strong>Requests</strong> are confirmed only once the business accepts them; until then your time is held, and
            unanswered requests expire.
          </li>
          <li>You can cancel or reschedule from your booking page within the business&apos;s rules. Late cancellations and no-shows may cost you some or all of a deposit, or a fee, exactly as shown when you booked.</li>
          <li>If a service is priced as an estimate (for example &ldquo;from&rdquo; or a range), the final price is agreed with the business at your appointment.</li>
          <li>If Kept charges a service fee for a booking, it&apos;s shown before you confirm. We never add charges afterwards.</li>
        </ul>
      </>
    ),
  },
  {
    id: "payments",
    title: "Payments and refunds",
    body: (
      <>
        <p>Online payments are processed by Stripe. Kept never sees or stores your full card number. Some businesses take payment in person instead; in that case you pay them directly.</p>
        <ul>
          <li>Refunds follow the business&apos;s policy shown at booking, and are issued to the card you paid with. Your bank may take several business days to show them.</li>
          <li>If a business cancels or declines your appointment, everything you paid online for it is refunded.</li>
          <li>
            If something went wrong with a payment, <Link href="/support/new?category=payment">contact us</Link> before opening a dispute with your bank — it&apos;s usually faster.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "businesses",
    title: "For professionals and businesses",
    body: (
      <ul>
        <li>Your listing must be accurate: who you are, what you offer, your prices, where you work and your policies. Photos and videos must be of your own work, or used with permission.</li>
        <li>You&apos;re responsible for holding any licences, permits, insurance and qualifications your work requires, and for meeting your tax obligations.</li>
        <li>Honour the bookings you accept and the policies you publish. Repeated last-minute cancellations, no-shows or misleading listings can lead to your profile being suspended.</li>
        <li>
          Plans, limits and fees are listed on our <Link href="/for-business#pricing">pricing page</Link>. A platform fee applies only to payments clients make online through Kept. Payouts are made
          by Stripe to your own account and are also subject to Stripe&apos;s terms.
        </li>
        <li>Client details you receive through Kept may be used to provide and follow up on your services. Send marketing only to clients who agreed to receive it.</li>
        <li>You keep ownership of what you upload, and give Kept permission to display it on Kept and in promotion of your profile while your listing is active.</li>
        <li>Spotlight placements are always labelled as promoted. They&apos;re free during launch; if that changes we&apos;ll tell you before anything is charged.</li>
      </ul>
    ),
  },
  {
    id: "reviews",
    title: "Reviews",
    body: (
      <>
        <p>Only customers with a completed appointment can leave a review, once per appointment. Reviews must be honest and about your own experience. Businesses may reply publicly.</p>
        <p>
          Offering anything in exchange for a review, or for removing one, isn&apos;t allowed. We may hide or remove reviews that break these terms — for example spam, hate, personal information or
          conflicts of interest — but we don&apos;t remove reviews just because they&apos;re negative.
        </p>
      </>
    ),
  },
  {
    id: "conduct",
    title: "Things you can't do on Kept",
    body: (
      <ul>
        <li>Offer or book anything illegal, sexual services, or anything that puts people at risk.</li>
        <li>Harass, threaten or discriminate against anyone — customers, professionals or our team.</li>
        <li>Create fake accounts, listings, bookings or reviews, or impersonate someone else.</li>
        <li>Upload content you don&apos;t have the right to share, or that contains other people&apos;s personal information without permission.</li>
        <li>Scrape, overload, probe or interfere with the service, or try to get around its security or fees.</li>
      </ul>
    ),
  },
  {
    id: "our-role",
    title: "Our role and its limits",
    body: (
      <>
        <p>
          We work to keep Kept safe and reliable, and we act on reports. But businesses on Kept are independent — they aren&apos;t our employees or agents, and we don&apos;t guarantee the quality,
          safety or legality of their services. A &ldquo;verified&rdquo; badge means we reviewed documents the business provided; it isn&apos;t an endorsement.
        </p>
        <p>
          Kept is provided &ldquo;as is&rdquo;. To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, or for what happens during a service between you and a business.
          Nothing in these terms limits rights you have under consumer protection law that can&apos;t be excluded.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Suspension and closing your account",
    body: (
      <>
        <p>
          You can delete your account at any time in <Link href="/account/privacy">Privacy &amp; data</Link>. Upcoming appointments are cancelled under each business&apos;s policy, and records
          businesses need — such as past appointments and payments — are kept in anonymised form.
        </p>
        <p>We may suspend or close accounts that break these terms or put others at risk. Where we can, we&apos;ll tell you why and give you a chance to respond.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes, disputes and contact",
    body: (
      <>
        <p>When we change these terms in a way that matters, we&apos;ll tell you in advance by email or in the app. Continuing to use Kept after a change takes effect means you accept it.</p>
        <p>The governing law and the process for resolving disputes will be added here after legal review, before Kept launches publicly.</p>
        <p>
          Questions about these terms? <Link href="/support/new?category=other">Contact us</Link>.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of service"
      updated="October 1, 2026"
      intro={
        <p>
          These terms explain how Kept works and what we expect from everyone who uses it. We&apos;ve kept them short and readable. If something here is unclear,{" "}
          <Link href="/support/new?category=other" className="font-medium text-ink underline underline-offset-4">
            ask us
          </Link>
          .
        </p>
      }
      sections={sections}
    />
  );
}
