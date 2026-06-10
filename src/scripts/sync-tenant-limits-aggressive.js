const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateLimits() {
  const planSpecs = {
    'starter': { mints: 300, limit: 300 },
    'pro': { mints: 1200, limit: 1200 },
    'premium': { mints: 5000, limit: 5000 },
    'prime': { mints: 5000, limit: 5000 }
  };

  const tenants = await prisma.tenant.findMany();
  for (const t of tenants) {
    const spec = planSpecs[t.plan?.toLowerCase()] || planSpecs['starter'];
    
    await prisma.tenant.update({
      where: { id: t.id },
      data: { 
        monthlyLimit: spec.limit,
        // Also update tokens if they are suspiciously low (like the 200 in the screenshot)
        tokenBalance: { set: Math.max(t.tokenBalance, spec.mints) },
        totalTokensPurchased: { set: Math.max(t.totalTokensPurchased, spec.mints) }
      }
    });
    console.log(`Updated ${t.name} (${t.plan}) -> Limit: ${spec.limit}, Tokens: ${spec.mints}`);
  }
}

updateLimits().catch(console.error).finally(() => prisma.$disconnect());
