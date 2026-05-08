const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const biz = await prisma.business.findFirst({
    where: { name: { contains: "Max's dental Clinic" } }
  });

  if (biz) {
    console.log(`Found Business: ${biz.name} (${biz.id})`);
    const updated = await prisma.business.update({
      where: { id: biz.id },
      data: { aiVoiceId: "agent_5501kqtn1qjxe5nvyc9x6zyn8w8g" }
    });
    console.log(`Updated Agent ID to: ${updated.aiVoiceId}`);
  } else {
    console.log("Business not found.");
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
