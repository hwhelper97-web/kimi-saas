const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function check() {
  const count = await prisma.call.count();
  console.log(`Total calls: ${count}`);
  const latest = await prisma.call.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, businessId: true, tenantId: true, createdAt: true }
  });
  console.log('Latest calls:', JSON.stringify(latest, null, 2));
  process.exit(0);
}

check();
