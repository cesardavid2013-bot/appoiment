import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { getViewer } from "@/server/auth/session";
import { features } from "@/server/env";
import { getBookingServiceDetail, getPublicBusiness } from "@/server/services/catalog";

export async function generateMetadata({ params }: PageProps<"/[slug]/book">): Promise<Metadata> {
  const { slug } = await params;
  const b = await getPublicBusiness(slug);
  return { title: b ? `Book with ${b.name}` : "Book", robots: { index: false } };
}

export default async function BookPage({ params, searchParams }: PageProps<"/[slug]/book">) {
  const { slug } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  const b = await getPublicBusiness(slug);
  if (!b || b.services.length === 0) notFound();
  const requested = typeof sp.service === "string" ? b.services.find((s) => s.id === sp.service) : undefined;
  const initialService = requested ?? (b.services.length === 1 ? b.services[0] : undefined);
  const detail = initialService ? await getBookingServiceDetail(b.id, initialService.id) : null;
  const start = typeof sp.start === "string" && !Number.isNaN(Date.parse(sp.start)) ? new Date(sp.start).toISOString() : null;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;

  return (
    <BookingFlow
      business={{
        id: b.id,
        slug: b.slug,
        name: b.name,
        kind: b.kind,
        timezone: b.timezone,
        currency: b.currency,
        bookingMode: b.bookingMode,
        allowAnyStaff: b.allowAnyStaff,
        policies: b.policies,
        latePolicy: b.latePolicy,
        logo: b.logo,
        services: b.services,
        team: b.team.map((t) => ({ id: t.id, name: t.name, title: t.title, avatar: t.avatar })),
        locations: b.locations,
      }}
      initialDetail={detail}
      initialStart={start}
      initialDate={date}
      viewer={viewer ? { name: viewer.name, email: viewer.email, emailVerified: viewer.emailVerified } : null}
      google={features.google}
    />
  );
}
