const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const biz = await prisma.business.findFirst({
    where: { name: { contains: "Max's dental Clinic" } }
  });

  if (biz) {
    const updated = await prisma.business.update({
      where: { id: biz.id },
      data: { timezone: "Asia/Karachi" }
    });
    console.log(`Updated Timezone for ${biz.name} to: ${updated.timezone}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
