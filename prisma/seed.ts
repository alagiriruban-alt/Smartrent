import { PrismaClient } from "@prisma/client";

import { dateOnlyToUtc } from "../src/lib/dates";
import { hashPassword } from "../src/lib/passwords";

const prisma = new PrismaClient();

const demoEmail = "landlord@example.com";
const demoPassword = "DemoRent1";

async function main() {
  const passwordHash = await hashPassword(demoPassword);
  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      name: "Avery Chen",
      email: demoEmail,
      passwordHash,
    },
  });

  const existing = await prisma.property.findFirst({
    where: { ownerId: user.id, name: "King Street duplex" },
  });

  if (!existing) {
    const tenant = await prisma.tenant.create({
      data: {
        ownerId: user.id,
        firstName: "Jordan",
        lastName: "Patel",
        email: "jordan@example.com",
        phone: "905-555-0148",
      },
    });

    await prisma.property.create({
      data: {
        ownerId: user.id,
        name: "King Street duplex",
        streetAddress: "18 King Street West",
        city: "Hamilton",
        province: "ON",
        postalCode: "L8P 1A1",
        units: {
          create: [
            {
              label: "Upper",
              bedrooms: 2,
              tenancies: {
                create: {
                  tenantId: tenant.id,
                  leaseStart: dateOnlyToUtc("2026-01-01"),
                  leaseEnd: dateOnlyToUtc("2026-12-31"),
                  monthlyRentCents: 185000,
                  rentDueDay: 1,
                },
              },
            },
            {
              label: "Lower",
              bedrooms: 1,
            },
          ],
        },
      },
    });
  }

  console.log("Sample landlord is ready.");
  console.log(`Email:    ${demoEmail}`);
  console.log(`Password: ${demoPassword}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
