const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const biz = await prisma.business.findFirst({
    where: { name: { contains: 'New York Pizza' } }
  });
  console.log('Business:', biz);
  if (biz) {
    const cats = await prisma.menuCategory.findMany({
      where: { businessId: biz.id }
    });
    console.log('Categories:', cats);
  }
  await prisma.$disconnect();
}

check();
