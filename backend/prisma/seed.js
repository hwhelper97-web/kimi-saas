const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const businesses = [
  {
    name: "Kimi Dental Studio",
    slug: "kimi-dental-studio",
    phone: "+1-555-0101",
    businessType: "APPOINTMENT",
    users: [
      {
        email: "owner.appointment@kimi-saas.local",
        fullName: "Appointment Owner",
        role: "OWNER",
        password: "KimiApp!2026",
      },
      {
        email: "admin@kimi-saas.local",
        fullName: "Global Admin",
        role: "ADMIN",
        password: "KimiAdmin!2026",
      },
    ],
  },
  {
    name: "Kimi Wellness Clinic",
    slug: "kimi-wellness-clinic",
    phone: "+1-555-0102",
    businessType: "APPOINTMENT",
    users: [
      {
        email: "owner.clinic@kimi-saas.local",
        fullName: "Clinic Owner",
        role: "OWNER",
        password: "KimiClinic!2026",
      },
    ],
  },
  {
    name: "Kimi Burger House",
    slug: "kimi-burger-house",
    phone: "+1-555-0201",
    businessType: "ORDER",
    users: [
      {
        email: "owner.order@kimi-saas.local",
        fullName: "Order Owner",
        role: "OWNER",
        password: "KimiOrder!2026",
      },
    ],
  },
  {
    name: "Kimi Pizza Express",
    slug: "kimi-pizza-express",
    phone: "+1-555-0202",
    businessType: "ORDER",
    users: [
      {
        email: "owner.pizza@kimi-saas.local",
        fullName: "Pizza Owner",
        role: "OWNER",
        password: "KimiPizza!2026",
      },
    ],
  },
];

async function upsertBusinessWithUsers(seedBusiness) {
  const business = await prisma.business.upsert({
    where: { slug: seedBusiness.slug },
    update: {
      name: seedBusiness.name,
      phone: seedBusiness.phone,
      businessType: seedBusiness.businessType,
      isActive: true,
    },
    create: {
      name: seedBusiness.name,
      slug: seedBusiness.slug,
      phone: seedBusiness.phone,
      businessType: seedBusiness.businessType,
    },
  });

  for (const seedUser of seedBusiness.users) {
    const passwordHash = await bcrypt.hash(seedUser.password, 10);

    await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        fullName: seedUser.fullName,
        role: seedUser.role,
        businessId: business.id,
        passwordHash,
      },
      create: {
        email: seedUser.email,
        fullName: seedUser.fullName,
        role: seedUser.role,
        businessId: business.id,
        passwordHash,
      },
    });
  }
}

async function main() {
  for (const business of businesses) {
    await upsertBusinessWithUsers(business);
  }

  console.log("Seed complete. Businesses and users are ready for local testing.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
