import { PrismaClient } from "@prisma/client";
import { DEFAULT_BUSINESS_HOURS } from "../src/lib/config";

const prisma = new PrismaClient();

async function main() {
  // Business hours
  for (const h of DEFAULT_BUSINESS_HOURS) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: h.dayOfWeek },
      update: { openMin: h.openMin, closeMin: h.closeMin, active: h.active },
      create: h,
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
    const existing = await prisma.service.findFirst({ where: { name: s.name } });
    if (!existing) await prisma.service.create({ data: s });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
