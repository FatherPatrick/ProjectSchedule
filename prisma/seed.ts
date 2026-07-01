import { PrismaClient } from "@prisma/client";
import {
  BUSINESS_NAME,
  BUSINESS_TIMEZONE,
  DEFAULT_BUSINESS_HOURS,
} from "../src/lib/config";

const prisma = new PrismaClient();

const DEV_SALON_SLUG = "demo";

async function main() {
  // Dev/demo salon — real salons are created via the signup flow.
  const salon = await prisma.salon.upsert({
    where: { slug: DEV_SALON_SLUG },
    update: {},
    create: {
      slug: DEV_SALON_SLUG,
      name: BUSINESS_NAME,
      timezone: BUSINESS_TIMEZONE,
    },
  });

  // Business hours
  for (const h of DEFAULT_BUSINESS_HOURS) {
    await prisma.businessHours.upsert({
      where: {
        salonId_dayOfWeek: { salonId: salon.id, dayOfWeek: h.dayOfWeek },
      },
      update: { openMin: h.openMin, closeMin: h.closeMin, active: h.active },
      create: { ...h, salonId: salon.id },
    });
  }

  // Sample services
  const services = [
    {
      name: "Classic Manicure",
      durationMinutes: 45,
      priceCents: 3500,
      description: "Shape, cuticle care, polish.",
      sortOrder: 1,
    },
    {
      name: "Gel Manicure",
      durationMinutes: 60,
      priceCents: 5000,
      description: "Long-lasting gel polish.",
      sortOrder: 2,
    },
    {
      name: "Classic Pedicure",
      durationMinutes: 60,
      priceCents: 5500,
      description: "Relaxing soak, scrub, and polish.",
      sortOrder: 3,
    },
    {
      name: "Gel Pedicure",
      durationMinutes: 75,
      priceCents: 7000,
      description: "Pedicure with gel polish.",
      sortOrder: 4,
    },
  ];
  for (const s of services) {
    const existing = await prisma.service.findFirst({
      where: { salonId: salon.id, name: s.name },
    });
    if (!existing) {
      await prisma.service.create({ data: { ...s, salonId: salon.id } });
    }
  }

  console.log(`Seed complete for salon "${salon.slug}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
