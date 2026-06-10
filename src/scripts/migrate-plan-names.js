const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migratePlans() {
  const mapping = {
    'starter': 'nexa-core',
    'pro': 'nexa-flow',
    'premium': 'nexa-prime',
    'prime': 'nexa-prime',
    'enterprise': 'nexa-prime'
  };

  const tenants = await prisma.tenant.findMany();
  for (const t of tenants) {
    const oldPlan = t.plan?.toLowerCase();
    const newPlan = mapping[oldPlan];
    if (newPlan) {
      await prisma.tenant.update({
        where: { id: t.id },
        data: { plan: newPlan }
      });
      console.log(`Migrated ${t.name}: ${oldPlan} -> ${newPlan}`);
    }
  }
}

migratePlans().catch(console.error).finally(() => prisma.$disconnect());
