/**
 * Seeds the platform category taxonomy (safe for every environment) and,
 * with --demo, a development dataset. Demo data is refused in production.
 *
 *   npm run db:seed            # categories only
 *   npm run db:seed -- --demo  # + demo businesses, customers, history
 */
import "dotenv/config";
import { DateTime } from "luxon";
import { eq, sql } from "drizzle-orm";
import { db, sqlClient } from "../src/server/db/client";
import {
  appointments,
  availabilityRules,
  businessCustomers,
  businessMembers,
  businesses,
  categories,
  intakeForms,
  locations,
  occupancies,
  promotions,
  reviews,
  serviceOptionGroups,
  serviceOptions,
  serviceStaff,
  services,
  users,
} from "../src/server/db/schema";
import { hashPassword } from "../src/server/auth/password";
import { refreshSearchIndex } from "../src/server/services/business";
import { bookingReference, randomToken } from "../src/server/crypto";

type Cat = { slug: string; name: string; description: string; keywords: string[]; children?: { slug: string; name: string; keywords: string[] }[] };

export const TAXONOMY: Cat[] = [
  { slug: "hair", name: "Hair & Barbers", description: "Cuts, colour, styling, braids and grooming.", keywords: ["haircut", "barber", "fade", "taper", "salon", "stylist", "hair"], children: [
    { slug: "barber", name: "Barber", keywords: ["fade", "taper", "lineup", "beard", "shave", "skin fade"] },
    { slug: "hair-salon", name: "Hair salon", keywords: ["cut", "colour", "color", "balayage", "highlights", "blowout"] },
    { slug: "braids-locs", name: "Braids & locs", keywords: ["braids", "knotless", "locs", "retwist", "cornrows"] },
  ] },
  { slug: "nails", name: "Nails", description: "Manicures, pedicures, extensions and nail art.", keywords: ["nails", "manicure", "pedicure", "acrylic", "gel", "nail art"] },
  { slug: "beauty", name: "Beauty", description: "Lashes, brows, makeup and skin.", keywords: ["beauty"], children: [
    { slug: "lashes-brows", name: "Lashes & brows", keywords: ["lash extensions", "lash lift", "brow lamination", "microblading", "threading"] },
    { slug: "makeup", name: "Makeup", keywords: ["makeup artist", "bridal makeup", "glam"] },
    { slug: "skincare", name: "Skin & esthetics", keywords: ["facial", "esthetician", "skincare", "peel", "waxing"] },
  ] },
  { slug: "wellness", name: "Wellness", description: "Massage, spa and bodywork.", keywords: ["massage", "spa", "wellness", "relaxation"], children: [
    { slug: "massage", name: "Massage", keywords: ["deep tissue", "swedish", "sports massage", "prenatal"] },
    { slug: "spa", name: "Spa", keywords: ["spa day", "sauna", "body treatment"] },
  ] },
  { slug: "fitness", name: "Fitness", description: "Personal training, yoga, pilates and coaching.", keywords: ["personal trainer", "gym", "workout", "fitness", "pt"], children: [
    { slug: "personal-training", name: "Personal training", keywords: ["strength", "weight loss", "hiit", "coach"] },
    { slug: "yoga-pilates", name: "Yoga & pilates", keywords: ["yoga", "pilates", "reformer", "vinyasa", "meditation"] },
  ] },
  { slug: "tattoo-piercing", name: "Tattoo & piercing", description: "Custom tattoos, flash and piercings.", keywords: ["tattoo", "piercing", "flash", "fine line"] },
  { slug: "photography", name: "Photo & video", description: "Portraits, events, products and video.", keywords: ["photographer", "photoshoot", "headshots", "videographer", "wedding photography"] },
  { slug: "education", name: "Lessons & tutoring", description: "Tutors, music teachers and language lessons.", keywords: ["tutor", "lessons", "music", "piano", "guitar", "math", "language"] },
  { slug: "home-services", name: "Home services", description: "Cleaning, repairs and handymen.", keywords: ["cleaning", "cleaner", "handyman", "repair", "plumber", "assembly"] },
  { slug: "automotive", name: "Automotive", description: "Detailing, car wash and mobile mechanics.", keywords: ["car detailing", "detailer", "car wash", "ceramic coating", "mechanic"] },
  { slug: "pets", name: "Pets", description: "Grooming, sitting and training.", keywords: ["dog grooming", "groomer", "pet sitter", "dog walker", "dog training"] },
  { slug: "events", name: "Events", description: "DJs, planners and event pros.", keywords: ["dj", "event planner", "party", "wedding"] },
  { slug: "professional", name: "Professional services", description: "Consultants, coaches and advisors.", keywords: ["consultant", "coach", "advisor", "career coaching", "accountant"] },
  { slug: "other", name: "Other", description: "Everything else you can book.", keywords: [] },
];

async function seedCategories() {
  let order = 0;
  for (const c of TAXONOMY) {
    const [parent] = await db
      .insert(categories)
      .values({ slug: c.slug, name: c.name, description: c.description, keywords: c.keywords, sortOrder: order++ })
      .onConflictDoUpdate({ target: categories.slug, set: { name: c.name, description: c.description, keywords: c.keywords } })
      .returning();
    let childOrder = 0;
    for (const ch of c.children ?? []) {
      await db
        .insert(categories)
        .values({ slug: ch.slug, name: ch.name, keywords: ch.keywords, parentId: parent.id, sortOrder: childOrder++ })
        .onConflictDoUpdate({ target: categories.slug, set: { name: ch.name, keywords: ch.keywords, parentId: parent.id } });
    }
  }
  console.log(`✓ ${TAXONOMY.length} top-level categories`);
}

/* ─────────────────────────── Demo data ───────────────────────────── */

const DEMO_PASSWORD = "kept-demo-2026";
const TZ = "America/New_York";

type DemoService = {
  name: string;
  section?: string;
  description: string;
  duration: number;
  price: number;
  priceType?: "fixed" | "starting_at" | "range" | "free" | "quote";
  priceMax?: number;
  sale?: number;
  bufferAfter?: number;
  capacity?: number;
  approval?: boolean;
  groups?: { name: string; selection: "single" | "multiple"; required?: boolean; options: [string, number, number][] }[];
  staff?: number[];
};

type DemoBiz = {
  slug: string;
  name: string;
  kind: "individual" | "business";
  category: string;
  tagline: string;
  about: string;
  owner: string;
  staff?: { name: string; title: string }[];
  location: { kind: "physical" | "mobile" | "virtual"; line1?: string; city: string; region: string; postal?: string; lat?: number; lng?: number; radius?: number };
  hours: [number, number, number][]; // weekday, start, end (minutes)
  services: DemoService[];
  bookingMode?: "instant" | "request";
  languages?: string[];
  amenities?: string[];
  years?: number;
  verified?: boolean;
  policies?: { window: number; fee: number };
  intake?: boolean;
};

const h = (hh: number, mm = 0) => hh * 60 + mm;
const weekdays = (days: number[], s: number, e: number): [number, number, number][] => days.map((d) => [d, s, e]);

const DEMO: DemoBiz[] = [
  {
    slug: "north-fade-studio",
    name: "North Fade Studio",
    kind: "business",
    category: "barber",
    tagline: "Precision fades and classic cuts in Williamsburg",
    about: "A four-chair barbershop focused on clean fades, sharp lineups and unhurried hot-towel shaves. Walk out looking exactly how you asked — every time.",
    owner: "Marcus Hale",
    staff: [
      { name: "Dre Coleman", title: "Senior barber" },
      { name: "Luis Ortega", title: "Barber" },
    ],
    location: { kind: "physical", line1: "214 Bedford Ave", city: "Brooklyn", region: "NY", postal: "11249", lat: 40.7172, lng: -73.9573 },
    hours: [...weekdays([2, 3, 4, 5], h(10), h(19)), [6, h(9), h(17)], [7, h(10), h(15)]],
    languages: ["English", "Spanish"],
    amenities: ["Wi-Fi", "Card payments", "Wheelchair accessible"],
    years: 9,
    verified: true,
    policies: { window: 12, fee: 50 },
    services: [
      { name: "Signature cut", section: "Cuts", description: "Consultation, precision cut, wash and style.", duration: 45, price: 4500, bufferAfter: 10, groups: [{ name: "Add-ons", selection: "multiple", options: [["Beard trim & lineup", 1500, 15], ["Eyebrow cleanup", 500, 5], ["Hot towel", 800, 10]] }] },
      { name: "Skin fade", section: "Cuts", description: "Bald or skin fade blended to your preferred length on top.", duration: 45, price: 5000, bufferAfter: 10, groups: [{ name: "Add-ons", selection: "multiple", options: [["Beard trim & lineup", 1500, 15], ["Design / part", 1000, 10]] }] },
      { name: "Kids cut (under 12)", section: "Cuts", description: "Patient, quick cuts for young clients.", duration: 30, price: 3000 },
      { name: "Hot towel shave", section: "Shaves", description: "Straight razor shave with hot towels and post-shave balm.", duration: 40, price: 4000, staff: [0, 1] },
    ],
  },
  {
    slug: "studio-lune-nails",
    name: "Studio Lune",
    kind: "business",
    category: "nails",
    tagline: "Structured gel, extensions and hand-painted nail art",
    about: "A calm, light-filled nail studio. We specialise in long-wearing structured gel and custom art, done at a pace that respects your natural nails.",
    owner: "Ana Reyes",
    staff: [{ name: "Mia Chen", title: "Nail artist" }],
    location: { kind: "physical", line1: "88 Orchard St", city: "New York", region: "NY", postal: "10002", lat: 40.7182, lng: -73.9898 },
    hours: [...weekdays([2, 3, 4, 5, 6], h(10), h(20)), [7, h(11), h(17)]],
    amenities: ["Wi-Fi", "Complimentary drinks"],
    years: 6,
    intake: true,
    policies: { window: 24, fee: 50 },
    services: [
      {
        name: "Gel extensions",
        section: "Extensions",
        description: "Full set of soft gel extensions shaped to your choice.",
        duration: 90,
        price: 7000,
        bufferAfter: 10,
        groups: [
          { name: "Length", selection: "single", required: true, options: [["Short", 0, 0], ["Medium", 1000, 10], ["Long", 2000, 20], ["XL", 3000, 30]] },
          { name: "Shape", selection: "single", required: true, options: [["Square", 0, 0], ["Almond", 0, 0], ["Coffin", 0, 5], ["Stiletto", 500, 10]] },
          { name: "Design", selection: "single", options: [["French", 1000, 15], ["Custom art", 2500, 30], ["Advanced art", 4500, 50]] },
        ],
      },
      { name: "Structured gel manicure", section: "Manicures", description: "Builder gel overlay on natural nails for strength and shine.", duration: 60, price: 5500, groups: [{ name: "Finish", selection: "single", options: [["Chrome", 1000, 10], ["Cat eye", 1000, 10]] }] },
      { name: "Gel removal", section: "Manicures", description: "Gentle soak-off with cuticle care.", duration: 20, price: 1500 },
    ],
  },
  {
    slug: "maya-okafor-pt",
    name: "Maya Okafor Training",
    kind: "individual",
    category: "personal-training",
    tagline: "Strength coaching for real schedules",
    about: "Certified strength coach (NSCA-CSCS). I build simple, progressive programs around your goals — whether that's your first pull-up or getting back after an injury. Sessions in-studio or online.",
    owner: "Maya Okafor",
    location: { kind: "physical", line1: "30 Jay St", city: "Brooklyn", region: "NY", postal: "11201", lat: 40.7041, lng: -73.9866 },
    hours: [...weekdays([1, 2, 3, 4, 5], h(6), h(11)), ...weekdays([1, 3, 5], h(16), h(20)), [6, h(8), h(12)]],
    languages: ["English"],
    years: 7,
    verified: true,
    services: [
      { name: "1:1 strength session", description: "60 minutes of coached training with a program you keep.", duration: 60, price: 9000, bufferAfter: 15 },
      { name: "Intro consultation", description: "Movement assessment and goal setting. No commitment.", duration: 30, price: 0, priceType: "free" },
      { name: "Small-group strength", description: "Coached group class, max 6 people.", duration: 60, price: 3500, capacity: 6 },
    ],
  },
  {
    slug: "calm-hands-massage",
    name: "Calm Hands Massage",
    kind: "individual",
    category: "massage",
    tagline: "Deep tissue and sports massage in Park Slope",
    about: "Licensed massage therapist with a focus on recovery for runners and desk workers. Clear communication about pressure, every session.",
    owner: "Elena Novak",
    location: { kind: "physical", line1: "412 7th Ave", city: "Brooklyn", region: "NY", postal: "11215", lat: 40.6681, lng: -73.9806 },
    hours: [...weekdays([2, 3, 4, 5], h(11), h(20)), [6, h(10), h(16)]],
    years: 11,
    bookingMode: "request",
    policies: { window: 24, fee: 100 },
    services: [
      { name: "Deep tissue massage", description: "Focused work on chronic tension.", duration: 60, price: 12000, bufferAfter: 15, groups: [{ name: "Duration", selection: "single", required: true, options: [["60 minutes", 0, 0], ["90 minutes", 5000, 30]] }] },
      { name: "Sports recovery massage", description: "Targeted recovery work around training and races.", duration: 60, price: 13000, bufferAfter: 15 },
    ],
  },
  {
    slug: "shine-mobile-detailing",
    name: "Shine Mobile Detailing",
    kind: "business",
    category: "automotive",
    tagline: "We come to you — interior and exterior detailing",
    about: "Fully mobile detailing across Brooklyn and Queens. We bring water and power. Interior deep-cleans, paint correction and ceramic coating.",
    owner: "Tom Ruiz",
    location: { kind: "mobile", city: "Brooklyn", region: "NY", lat: 40.6782, lng: -73.9442, radius: 25 },
    hours: weekdays([1, 2, 3, 4, 5, 6], h(8), h(17)),
    intake: true,
    services: [
      {
        name: "Full detail",
        description: "Interior and exterior detail. Final price depends on vehicle condition.",
        duration: 180,
        price: 18000,
        priceType: "starting_at",
        bufferAfter: 30,
        groups: [{ name: "Vehicle size", selection: "single", required: true, options: [["Sedan / coupe", 0, 0], ["SUV / crossover", 4000, 30], ["Truck / van", 6000, 45]] }],
      },
      { name: "Interior refresh", description: "Vacuum, wipe-down, glass and mats.", duration: 90, price: 9000, bufferAfter: 30 },
      { name: "Ceramic coating", description: "Paint prep and 3-year coating. Quoted after inspection.", duration: 360, price: 0, priceType: "quote", approval: true },
    ],
  },
  {
    slug: "jo-park-photo",
    name: "Jo Park Photography",
    kind: "individual",
    category: "photography",
    tagline: "Natural-light portraits and headshots",
    about: "Portraits that look like you on a good day. Studio in Gowanus or on location anywhere in NYC.",
    owner: "Jo Park",
    location: { kind: "physical", line1: "540 President St", city: "Brooklyn", region: "NY", postal: "11215", lat: 40.6775, lng: -73.9858 },
    hours: [...weekdays([3, 4, 5, 6, 7], h(10), h(18))],
    years: 8,
    services: [
      { name: "Headshot session", description: "30 minutes, 2 looks, 5 retouched images.", duration: 30, price: 25000, bufferAfter: 15 },
      { name: "Portrait session", description: "60 minutes, unlimited looks, 15 retouched images.", duration: 60, price: 45000, bufferAfter: 30 },
    ],
  },
  {
    slug: "ivy-learning",
    name: "Ivy Learning Co.",
    kind: "business",
    category: "education",
    tagline: "Math and science tutoring, grades 6–12",
    about: "Patient, structured tutoring online or at our Cobble Hill center. Every student gets a written progress note after each session.",
    owner: "Priya Shah",
    staff: [{ name: "Daniel Kim", title: "Physics & math tutor" }],
    location: { kind: "virtual", city: "New York", region: "NY" },
    hours: [...weekdays([1, 2, 3, 4], h(15), h(21)), [7, h(10), h(16)]],
    languages: ["English", "Hindi", "Korean"],
    services: [
      { name: "Math tutoring", description: "Algebra through calculus.", duration: 60, price: 7500, groups: [{ name: "Session length", selection: "single", required: true, options: [["60 minutes", 0, 0], ["90 minutes", 3500, 30]] }] },
      { name: "SAT prep", description: "Diagnostic-driven SAT math prep.", duration: 90, price: 11000 },
    ],
  },
];

async function demoUser(name: string, email: string, passwordHash: string) {
  const [u] = await db
    .insert(users)
    .values({ name, email, passwordHash, emailVerifiedAt: new Date(), timezone: TZ })
    .onConflictDoUpdate({ target: users.email, targetWhere: sql`${users.email} is not null`, set: { name } })
    .returning();
  return u;
}

async function seedDemo() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const allCats = await db.select().from(categories);
  const catId = (slug: string) => allCats.find((c) => c.slug === slug)!.id;

  const admin = await demoUser("Kept Admin", "admin@kept.test", passwordHash);
  await db.update(users).set({ platformRole: "admin" }).where(eq(users.id, admin.id));
  const customers = await Promise.all(
    ["Sam Rivera", "Jordan Lee", "Priya Patel", "Chris Walker", "Taylor Brooks", "Alex Kim"].map((n, i) => demoUser(n, i === 0 ? "customer@kept.test" : `customer${i}@kept.test`, passwordHash)),
  );

  for (const d of DEMO) {
    const [exists] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, d.slug));
    if (exists) continue;
    const owner = await demoUser(d.owner, d.slug === "north-fade-studio" ? "pro@kept.test" : `${d.slug}@kept.test`, passwordHash);
    const [biz] = await db
      .insert(businesses)
      .values({
        slug: d.slug,
        name: d.name,
        kind: d.kind,
        ownerUserId: owner.id,
        primaryCategoryId: catId(d.category),
        tagline: d.tagline,
        about: d.about,
        timezone: TZ,
        status: "active",
        publishedAt: DateTime.now().minus({ days: Math.floor(Math.random() * 120) }).toJSDate(),
        bookingMode: d.bookingMode ?? "instant",
        languages: d.languages ?? ["English"],
        amenities: d.amenities ?? [],
        yearsExperience: d.years ?? null,
        verificationStatus: d.verified ? "verified" : "not_submitted",
        cancellationWindowHours: d.policies?.window ?? 24,
        lateCancelFeePercent: d.policies?.fee ?? 0,
        noShowFeePercent: d.policies?.fee ?? 0,
        contactEmail: owner.email,
        onboarding: { completed: ["category", "kind", "name", "branding", "location", "services", "availability", "policies", "payments", "preview"] },
      })
      .returning();
    const [loc] = await db
      .insert(locations)
      .values({
        businessId: biz.id,
        name: d.location.kind === "physical" ? d.name : d.location.kind === "mobile" ? "Mobile service" : "Online",
        kind: d.location.kind,
        line1: d.location.line1,
        city: d.location.city,
        region: d.location.region,
        postalCode: d.location.postal,
        country: "US",
        lat: d.location.lat,
        lng: d.location.lng,
        serviceRadiusKm: d.location.radius,
        timezone: TZ,
        isPrimary: true,
      })
      .returning();

    const memberRows = [
      { userId: owner.id, role: "owner" as const, displayName: d.kind === "individual" ? d.name : d.owner, title: d.kind === "individual" ? null : "Owner" },
      ...(d.staff ?? []).map((s) => ({ userId: null, role: "provider" as const, displayName: s.name, title: s.title })),
    ];
    const members: (typeof businessMembers.$inferSelect)[] = [];
    for (const [i, m] of memberRows.entries()) {
      let userId = m.userId;
      if (!userId) userId = (await demoUser(m.displayName, `${m.displayName.toLowerCase().replace(/[^a-z]/g, ".")}@kept.test`, passwordHash)).id;
      const [row] = await db.insert(businessMembers).values({ businessId: biz.id, userId, role: m.role, displayName: m.displayName, title: m.title, sortOrder: i, joinedAt: new Date() }).returning();
      members.push(row);
      await db.insert(availabilityRules).values(d.hours.map(([weekday, start, end]) => ({ businessId: biz.id, memberId: row.id, weekday, startMinute: start, endMinute: end })));
    }

    let formId: string | null = null;
    if (d.intake) {
      const fields =
        d.category === "nails"
          ? [
              { id: "current", type: "yes_no", label: "Do you currently have acrylic or gel on your nails?", required: true },
              { id: "inspo", type: "long_text", label: "Describe the look you want (or paste an inspiration link)", required: false },
            ]
          : [
              { id: "vehicle", type: "short_text", label: "Make and model of your vehicle", required: true },
              { id: "parking", type: "single_choice", label: "Where will the car be parked?", required: true, options: ["Driveway", "Street", "Garage"] },
              { id: "water", type: "yes_no", label: "Is there an outdoor power outlet we can use?", required: false },
            ];
      formId = (await db.insert(intakeForms).values({ businessId: biz.id, name: "Before your visit", fields }).returning())[0].id;
    }

    for (const [si, s] of d.services.entries()) {
      const [svc] = await db
        .insert(services)
        .values({
          businessId: biz.id,
          categoryId: catId(d.category),
          menuSection: s.section ?? null,
          name: s.name,
          slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          description: s.description,
          durationMinutes: s.duration,
          bufferAfterMinutes: s.bufferAfter ?? 0,
          priceType: s.priceType ?? "fixed",
          priceCents: s.price,
          priceMaxCents: s.priceMax ?? null,
          salePriceCents: s.sale ?? null,
          capacity: s.capacity ?? 1,
          requiresApproval: s.approval ?? null,
          intakeFormId: formId,
          sortOrder: si,
        })
        .returning();
      const staffIdx = s.staff ?? members.map((_, i) => i);
      await db.insert(serviceStaff).values(staffIdx.map((i) => ({ serviceId: svc.id, memberId: members[i].id })));
      for (const [gi, g] of (s.groups ?? []).entries()) {
        const [grp] = await db.insert(serviceOptionGroups).values({ serviceId: svc.id, name: g.name, selection: g.selection, required: g.required ?? false, sortOrder: gi }).returning();
        await db.insert(serviceOptions).values(g.options.map(([name, price, dur], oi) => ({ groupId: grp.id, name, priceDeltaCents: price, durationDeltaMinutes: dur, sortOrder: oi })));
      }
    }

    if (d.slug === "north-fade-studio") {
      await db.insert(promotions).values({ businessId: biz.id, code: "FIRSTCUT", name: "First visit", kind: "percent", value: 1500, newCustomersOnly: true });
    }

    // History: completed visits in the past few weeks, with reviews from those visits.
    const [firstSvc] = await db.select().from(services).where(eq(services.businessId, biz.id)).limit(1);
    const reviewTexts = [
      "Exactly what I asked for. On time and genuinely friendly.",
      "Really careful work and clear about pricing up front.",
      "Booking was easy and the result was great. Will be back.",
      "Took time to understand what I wanted. Highly recommend.",
    ];
    const historyCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < historyCount; i++) {
      const customer = customers[(i + DEMO.indexOf(d)) % customers.length];
      const start = DateTime.now().setZone(TZ).minus({ days: 3 + i * 6 }).set({ hour: 11 + (i % 4), minute: 0, second: 0, millisecond: 0 });
      const end = start.plus({ minutes: firstSvc.durationMinutes });
      const [bc] = await db
        .insert(businessCustomers)
        .values({ businessId: biz.id, userId: customer.id, name: customer.name, email: customer.email, appointmentCount: 1, completedCount: 1, totalSpentCents: firstSvc.priceCents, firstVisitAt: start.toJSDate(), lastVisitAt: start.toJSDate() })
        .onConflictDoNothing()
        .returning();
      if (!bc) continue;
      const [appt] = await db
        .insert(appointments)
        .values({
          reference: bookingReference(),
          businessId: biz.id,
          locationId: loc.id,
          serviceId: firstSvc.id,
          memberId: members[0].id,
          customerUserId: customer.id,
          businessCustomerId: bc.id,
          status: "completed",
          startsAt: start.toJSDate(),
          endsAt: end.toJSDate(),
          blockStartsAt: start.toJSDate(),
          blockEndsAt: end.toJSDate(),
          timezone: TZ,
          snapshot: {
            serviceName: firstSvc.name,
            durationMinutes: firstSvc.durationMinutes,
            priceType: firstSvc.priceType,
            options: [],
            memberName: d.kind === "individual" ? null : members[0].displayName,
            locationName: loc.name,
            locationKind: loc.kind,
            address: loc.line1 ? `${loc.line1}, ${loc.city}, ${loc.region}` : null,
            cancellationWindowHours: 24,
            rescheduleWindowHours: 24,
            depositRefundable: true,
            lateCancelFeePercent: 0,
            noShowFeePercent: 0,
            lines: [{ kind: "service", label: firstSvc.name, amountCents: firstSvc.priceCents }],
          },
          currency: "USD",
          subtotalCents: firstSvc.priceCents,
          totalCents: firstSvc.priceCents,
          amountPaidCents: firstSvc.priceCents,
          paymentStatus: firstSvc.priceCents > 0 ? "paid" : "not_required",
          checkInCode: randomToken(12),
          completedAt: end.toJSDate(),
          confirmedAt: start.minus({ days: 5 }).toJSDate(),
        })
        .returning();
      await db.insert(occupancies).values({ businessId: biz.id, memberId: members[0].id, appointmentId: appt.id, startsAt: appt.blockStartsAt, endsAt: appt.blockEndsAt });
      if (i < historyCount - 1) {
        await db.insert(reviews).values({
          appointmentId: appt.id,
          businessId: biz.id,
          memberId: members[0].id,
          serviceId: firstSvc.id,
          customerUserId: customer.id,
          rating: i === 2 ? 4 : 5,
          body: reviewTexts[i % reviewTexts.length],
          createdAt: end.plus({ hours: 5 }).toJSDate(),
        });
      }
    }
    await db.execute(sql`
      update businesses set
        rating_avg = (select avg(rating)::float from reviews where business_id = ${biz.id} and status = 'published'),
        rating_count = (select count(*) from reviews where business_id = ${biz.id} and status = 'published')
      where id = ${biz.id}`);
    await refreshSearchIndex(biz.id);
    console.log(`✓ ${d.name}`);
  }
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD})\n  customer@kept.test  — customer\n  pro@kept.test       — owner of North Fade Studio\n  admin@kept.test     — platform admin`);
}

async function main() {
  await seedCategories();
  if (process.argv.includes("--demo")) await seedDemo();
  await sqlClient.end();
}

main().catch(async (err) => {
  console.error(err);
  await sqlClient.end();
  process.exit(1);
});
