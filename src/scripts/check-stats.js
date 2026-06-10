const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  const tenants = await prisma.tenant.findMany();
  const businesses = await prisma.business.findMany();
  const calls = await prisma.call.findMany({ take: 5 });
  console.log("Tenants:", tenants.length);
  console.log("Businesses:", businesses.length);
  console.log("Calls:", calls.length);
  if (calls.length > 0) {
    console.log("First call sample:", JSON.stringify(calls[0], null, 2));
  }
}

checkData().catch(console.error).finally(() => prisma.$disconnect());
