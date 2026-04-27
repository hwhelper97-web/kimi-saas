const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const updatedBusiness = await prisma.business.update({
    where: { id: "11af1858-dd05-44d2-952e-7048ccbb1a1e" },
    data: {
      name: "Nexton Burger",
      phoneNumber: "+15097977710",
      type: "restaurant"
    }
  });
  console.log("Updated Business:", JSON.stringify(updatedBusiness, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
