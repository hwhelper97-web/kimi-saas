const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const appointmentAgent = "agent_5501kqtn1qjxe5nvyc9x6zyn8w8g";
  const orderAgent = "agent_9401kqqj87jzf9mrmfwsprqh3frh";

  console.log("Updating businesses...");

  // Update appointment based businesses
  const apptResult = await prisma.business.updateMany({
    where: { 
      OR: [
        { type: "appointment" },
        { type: "salon" },
        { type: "clinic" },
        { type: "spa" }
      ]
    },
    data: { aiVoiceId: appointmentAgent }
  });
  console.log(`Updated ${apptResult.count} appointment-based businesses.`);

  // Update restaurant based businesses
  const orderResult = await prisma.business.updateMany({
    where: { 
      OR: [
        { type: "restaurant" },
        { type: "food" },
        { type: "order" },
        { type: "pizzeria" }
      ]
    },
    data: { aiVoiceId: orderAgent }
  });
  console.log(`Updated ${orderResult.count} order-based businesses.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
