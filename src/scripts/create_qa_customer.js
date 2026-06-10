const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'bbc47e11-e92f-4c84-af85-e262ee460138';
  const customer = await prisma.customer.create({
    data: {
      name: 'QA Test Customer',
      email: 'qa@test.ai',
      phone: '+15550101',
      tenantId: tenantId
    }
  });
  console.log('Customer created:', customer.id);
  await prisma.$disconnect();
}

main();
