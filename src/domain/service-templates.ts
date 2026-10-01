/**
 * Starter service suggestions per category. Names and typical durations only —
 * prices are left to the professional (they vary too much by market).
 */
export type ServiceTemplate = { name: string; durationMinutes: number; section?: string };

export const SERVICE_TEMPLATES: Record<string, ServiceTemplate[]> = {
  barber: [
    { name: "Haircut", durationMinutes: 45 },
    { name: "Skin fade", durationMinutes: 45 },
    { name: "Beard trim & lineup", durationMinutes: 20 },
    { name: "Haircut + beard", durationMinutes: 60 },
    { name: "Kids cut", durationMinutes: 30 },
  ],
  "hair-salon": [
    { name: "Women's cut & style", durationMinutes: 60 },
    { name: "Blowout", durationMinutes: 45 },
    { name: "Single-process colour", durationMinutes: 90 },
    { name: "Balayage", durationMinutes: 180 },
  ],
  "braids-locs": [
    { name: "Knotless braids", durationMinutes: 240 },
    { name: "Loc retwist", durationMinutes: 120 },
    { name: "Cornrows", durationMinutes: 90 },
  ],
  nails: [
    { name: "Gel manicure", durationMinutes: 60 },
    { name: "Gel extensions — full set", durationMinutes: 90 },
    { name: "Fill", durationMinutes: 60 },
    { name: "Pedicure", durationMinutes: 60 },
    { name: "Removal", durationMinutes: 20 },
  ],
  "lashes-brows": [
    { name: "Classic lash extensions", durationMinutes: 120 },
    { name: "Lash lift & tint", durationMinutes: 60 },
    { name: "Brow lamination", durationMinutes: 45 },
  ],
  makeup: [
    { name: "Full glam", durationMinutes: 75 },
    { name: "Bridal trial", durationMinutes: 90 },
  ],
  skincare: [
    { name: "Signature facial", durationMinutes: 60 },
    { name: "Express facial", durationMinutes: 30 },
  ],
  massage: [
    { name: "Swedish massage", durationMinutes: 60 },
    { name: "Deep tissue massage", durationMinutes: 60 },
    { name: "Sports massage", durationMinutes: 60 },
  ],
  "personal-training": [
    { name: "1:1 training session", durationMinutes: 60 },
    { name: "Intro consultation", durationMinutes: 30 },
    { name: "Partner session", durationMinutes: 60 },
  ],
  "yoga-pilates": [
    { name: "Private session", durationMinutes: 60 },
    { name: "Group class", durationMinutes: 60 },
  ],
  "tattoo-piercing": [
    { name: "Consultation", durationMinutes: 30 },
    { name: "Small tattoo", durationMinutes: 90 },
    { name: "Piercing", durationMinutes: 30 },
  ],
  photography: [
    { name: "Headshots", durationMinutes: 30 },
    { name: "Portrait session", durationMinutes: 60 },
    { name: "Event coverage (2 hours)", durationMinutes: 120 },
  ],
  education: [
    { name: "1:1 lesson", durationMinutes: 60 },
    { name: "Trial lesson", durationMinutes: 30 },
  ],
  "music-production": [
    { name: "Beat / instrumental production", durationMinutes: 180 },
    { name: "Mixing (per song)", durationMinutes: 120 },
    { name: "Mastering (per song)", durationMinutes: 60 },
    { name: "Production consultation", durationMinutes: 30 },
  ],
  "recording-studio": [
    { name: "Studio session — 2 hours", durationMinutes: 120 },
    { name: "Studio session with engineer — 4 hours", durationMinutes: 240 },
    { name: "Podcast recording", durationMinutes: 90 },
  ],
  "vocal-coaching": [
    { name: "Vocal lesson", durationMinutes: 60 },
    { name: "Audition preparation", durationMinutes: 45 },
  ],
  "content-creation": [
    { name: "UGC video package", durationMinutes: 120 },
    { name: "Content day (half day)", durationMinutes: 240 },
    { name: "Strategy call", durationMinutes: 45 },
  ],
  "video-editing": [
    { name: "Short-form edit (reel / TikTok)", durationMinutes: 60 },
    { name: "YouTube video edit", durationMinutes: 240 },
  ],
  "social-media": [
    { name: "Social media audit", durationMinutes: 60 },
    { name: "Monthly content planning", durationMinutes: 90 },
  ],
  "graphic-design": [
    { name: "Logo design consultation", durationMinutes: 60 },
    { name: "Brand identity workshop", durationMinutes: 120 },
  ],
  "web-design": [
    { name: "Website discovery call", durationMinutes: 45 },
    { name: "Landing page design session", durationMinutes: 120 },
  ],
  "interior-design": [
    { name: "In-home design consultation", durationMinutes: 90 },
    { name: "Virtual room styling", durationMinutes: 60 },
  ],
  physio: [
    { name: "Initial assessment", durationMinutes: 60 },
    { name: "Follow-up treatment", durationMinutes: 45 },
    { name: "Chiropractic adjustment", durationMinutes: 30 },
  ],
  nutrition: [
    { name: "Initial nutrition consultation", durationMinutes: 60 },
    { name: "Follow-up & meal plan review", durationMinutes: 30 },
  ],
  therapy: [
    { name: "Initial consultation", durationMinutes: 30 },
    { name: "Individual session", durationMinutes: 50 },
    { name: "Couples session", durationMinutes: 80 },
  ],
  cleaning: [
    { name: "Standard home cleaning", durationMinutes: 180 },
    { name: "Deep cleaning", durationMinutes: 300 },
    { name: "Move-out cleaning", durationMinutes: 360 },
  ],
  handyman: [
    { name: "Handyman — first hour", durationMinutes: 60 },
    { name: "Furniture assembly", durationMinutes: 120 },
    { name: "TV mounting", durationMinutes: 60 },
  ],
  gardening: [
    { name: "Lawn mowing & edging", durationMinutes: 60 },
    { name: "Garden maintenance", durationMinutes: 120 },
  ],
  "home-services": [
    { name: "Standard cleaning", durationMinutes: 120 },
    { name: "Deep cleaning", durationMinutes: 240 },
    { name: "Handyman — first hour", durationMinutes: 60 },
  ],
  automotive: [
    { name: "Interior detail", durationMinutes: 120 },
    { name: "Full detail", durationMinutes: 240 },
    { name: "Exterior wash", durationMinutes: 60 },
  ],
  pets: [
    { name: "Full groom", durationMinutes: 90 },
    { name: "Bath & brush", durationMinutes: 60 },
    { name: "Nail trim", durationMinutes: 15 },
  ],
  events: [
    { name: "Consultation call", durationMinutes: 30 },
    { name: "DJ set (4 hours)", durationMinutes: 240 },
  ],
  professional: [
    { name: "Intro call", durationMinutes: 30 },
    { name: "1:1 session", durationMinutes: 60 },
  ],
};

export function templatesFor(categorySlug: string | null | undefined, parentSlug?: string | null): ServiceTemplate[] {
  if (categorySlug && SERVICE_TEMPLATES[categorySlug]) return SERVICE_TEMPLATES[categorySlug];
  if (parentSlug && SERVICE_TEMPLATES[parentSlug]) return SERVICE_TEMPLATES[parentSlug];
  if (categorySlug === "hair") return SERVICE_TEMPLATES.barber;
  if (categorySlug === "beauty") return SERVICE_TEMPLATES["lashes-brows"];
  if (categorySlug === "wellness") return SERVICE_TEMPLATES.massage;
  if (categorySlug === "fitness") return SERVICE_TEMPLATES["personal-training"];
  return [{ name: "Consultation", durationMinutes: 30 }, { name: "Standard appointment", durationMinutes: 60 }];
}

export const DURATION_CHOICES = [10, 15, 20, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480];
