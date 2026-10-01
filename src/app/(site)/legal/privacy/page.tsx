import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc } from "@/components/legal/doc";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What personal data Kept collects, why, who sees it, and how to download or delete it.",
  alternates: { canonical: "/legal/privacy" },
};

const sections = [
  {
    id: "summary",
    title: "The short version",
    body: (
      <ul>
        <li>We collect what we need to run bookings: who you are, what you book, and how to reach you.</li>
        <li>The businesses you book with see the details they need to serve you. Nobody else does, apart from the service providers that help us run Kept.</li>
        <li>We don&apos;t sell your personal data, and we don&apos;t use advertising trackers.</li>
        <li>
          You can download a copy of your data or delete your account yourself, any time, in <Link href="/account/privacy">Privacy &amp; data</Link>.
        </li>
      </ul>
    ),
  },
  {
    id: "you-give",
    title: "Information you give us",
    body: (
      <ul>
        <li>
          <strong>Account:</strong> your name, email, password (stored only as a one-way hash), and optionally your phone number, photo and time zone. If you sign in with Google, we receive your
          name and email from Google.
        </li>
        <li>
          <strong>Bookings:</strong> the service, time, business and price; notes you add; answers to a business&apos;s intake questions; and an address if a professional comes to you.
        </li>
        <li>
          <strong>Payments:</strong> amounts, status and refunds. Card details go directly to Stripe — we never receive your full card number.
        </li>
        <li>
          <strong>Messages, reviews and support requests</strong>, including any images you attach, and addresses you save.
        </li>
        <li>
          <strong>Businesses</strong> also give us business details, team members, services, schedules, portfolio media, payout details (held by Stripe) and the client records they keep.
        </li>
      </ul>
    ),
  },
  {
    id: "automatic",
    title: "Information collected automatically",
    body: (
      <ul>
        <li>
          <strong>Sign-in sessions:</strong> a cookie keeps you signed in. We store the session with your browser type so your devices can be signed out securely.
        </li>
        <li>
          <strong>Security:</strong> we store a keyed, one-way hash of your IP address — not the address itself — to rate-limit abuse and investigate suspicious activity.
        </li>
        <li>
          <strong>Location:</strong> if you choose a place or share your location to search nearby, it&apos;s saved in a cookie on your device to remember your choice. We don&apos;t track your
          location in the background.
        </li>
        <li>
          <strong>Activity on Kept:</strong> professionals you view and save, so we can show them again; and counts of views and clicks on promoted listings, reported to businesses only as totals.
        </li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul>
        <li>To make, change and remind you about bookings, and to process payments and refunds.</li>
        <li>To send the notifications you&apos;ve chosen. Booking confirmations and changes are always sent; everything else can be turned off in Notification settings.</li>
        <li>To show you relevant professionals and openings near you.</li>
        <li>To keep Kept safe: preventing fraud, spam and abuse, and acting on reports.</li>
        <li>To answer support requests and improve Kept.</li>
        <li>To meet legal obligations, such as tax and accounting records.</li>
      </ul>
    ),
  },
  {
    id: "businesses",
    title: "What businesses see",
    body: (
      <>
        <p>
          When you book, the business sees your name, email and phone number (if you added one), the booking and anything you shared with it — notes, intake answers, a service address — plus your
          previous visits with them. They can add private notes to their client record.
        </p>
        <p>
          Each business is responsible for how it uses its client records, and may only send you marketing if you agreed to it. Reviews are public and show your first name and last initial.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who else we share it with",
    body: (
      <>
        <p>We use a small number of providers who process data on our behalf, under contracts that limit what they can do with it:</p>
        <ul>
          <li>Stripe, for payments and payouts.</li>
          <li>Our email provider, and an SMS provider if text messages are enabled.</li>
          <li>Google, only if you choose to sign in with Google.</li>
          <li>Map and address-lookup services, to show maps and find places you search for.</li>
          <li>Our hosting and infrastructure providers.</li>
        </ul>
        <p>
          We may also disclose information when the law requires it, to protect someone&apos;s safety, or as part of a merger or acquisition — in which case this policy would continue to apply. We
          never sell personal data.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    body: (
      <ul>
        <li>
          <strong>Access:</strong> download a copy of your data from <Link href="/account/privacy">Privacy &amp; data</Link>.
        </li>
        <li>
          <strong>Correct:</strong> update your details in <Link href="/account/profile">Profile</Link>, or ask us to.
        </li>
        <li>
          <strong>Delete:</strong> delete your account in Privacy &amp; data. See below for what we keep.
        </li>
        <li>
          <strong>Notifications:</strong> choose what we send in <Link href="/account/notifications">Notification settings</Link>.
        </li>
        <li>
          Depending on where you live you may have further rights, such as objecting to certain uses or complaining to a data protection authority. <Link href="/support/new?category=account">Contact us</Link>{" "}
          and we&apos;ll help.
        </li>
      </ul>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <>
        <p>We keep your information while your account is open.</p>
        <p>
          When you delete your account, we erase your name, email, phone, photo, saved addresses, saved professionals, notifications and sign-in methods straight away. Records that businesses and
          accounting depend on — past appointments, payments and reviews — are kept, linked to &ldquo;Deleted user&rdquo; rather than to you. Messages you exchanged with a business stay in that
          business&apos;s conversation history.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Passwords are hashed with Argon2, sessions are stored server-side and can be revoked, connections are encrypted, and uploaded photos are re-encoded so hidden location data is removed. No system is
        perfectly secure; if we learn of a breach that affects you, we&apos;ll tell you promptly.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Kept accounts are for adults. A parent or guardian can book a service for their child; we don&apos;t knowingly collect personal data directly from children.</p>,
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <>
        <p>If we change this policy in a way that matters, we&apos;ll tell you before it takes effect.</p>
        <p>
          Questions or requests about your data? <Link href="/support/new?category=account">Contact us</Link>.
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDoc
      title="Privacy policy"
      updated="October 1, 2026"
      intro={<p>This policy explains what personal data Kept collects, why we need it, who can see it, and the choices you have — for customers and professionals alike.</p>}
      sections={sections}
    />
  );
}
