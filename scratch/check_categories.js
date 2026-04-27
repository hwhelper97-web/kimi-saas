const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.menuCategory.findMany({
    where: { businessId: "11af1858-dd05-44d2-952e-7048ccbb1a1e" },
    include: { items: true }
  });
  console.log(JSON.stringify(categories.map(c => ({ name: c.name, itemCount: c.items.length })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
