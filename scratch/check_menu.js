const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.findFirst({
    where: { name: "Nexton Burger" },
    include: {
      menuItems: {
        include: {
          sizes: true,
          optionGroups: {
            include: { options: true }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(business, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
