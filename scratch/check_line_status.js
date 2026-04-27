const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const businesses = await prisma.business.findMany({
    where: { phoneNumber: "+14782888237" },
    include: { tenant: true }
  });
  console.log("Businesses with number +14782888237:", JSON.stringify(businesses, null, 2));

  const recentCalls = await prisma.call.findMany({
    where: { toNumber: "14782888237" },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("Recent calls to this number:", JSON.stringify(recentCalls, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
