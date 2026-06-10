const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateLimits() {
  const planLimits = {
    'starter': 300,
    'pro': 1200,
    'premium': 5000,
    'prime': 5000
  };

  const tenants = await prisma.tenant.findMany();
  for (const t of tenants) {
    const limit = planLimits[t.plan?.toLowerCase()] || 300;
    await prisma.tenant.update({
      where: { id: t.id },
      data: { monthlyLimit: limit }
    });
    console.log(`Updated ${t.name} (${t.plan}) to ${limit} min`);
  }
}

updateLimits().catch(console.error).finally(() => prisma.$disconnect());
