const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.findUnique({
    where: { id: "11af1858-dd05-44d2-952e-7048ccbb1a1e" },
    select: { id: true, name: true, phoneNumber: true, tenantId: true }
  });
  console.log(JSON.stringify(business, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
