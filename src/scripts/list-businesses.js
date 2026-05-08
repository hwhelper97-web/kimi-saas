const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, type: true, aiVoiceId: true }
  });
  console.log(JSON.stringify(businesses, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
