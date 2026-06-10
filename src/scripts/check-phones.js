const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const phones = await prisma.tenantPhoneNumber.findMany({
    include: {
      tenant: true,
      business: true
    }
  });
  console.log(JSON.stringify(phones, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
