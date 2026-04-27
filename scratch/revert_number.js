const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.business.updateMany({
    where: { name: "Nexton Burger" },
    data: { phoneNumber: "+15097977710" }
  });
  console.log("Updated Businesses:", updated.count);
  
  const burger = await prisma.business.findFirst({
    where: { name: "Nexton Burger" }
  });
  console.log("Nexton Burger now on:", burger.phoneNumber);
}

main().catch(console.error).finally(() => prisma.$disconnect());
