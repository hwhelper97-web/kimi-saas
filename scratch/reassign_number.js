const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Find the Nexton Hair Salon business that currently has this number
  const hairSalon = await prisma.business.findFirst({
    where: { phoneNumber: "+14782888237" }
  });

  if (hairSalon) {
    console.log(`Unlinking +14782888237 from ${hairSalon.name} (${hairSalon.id})`);
    await prisma.business.update({
      where: { id: hairSalon.id },
      data: { phoneNumber: "" } // Or some placeholder
    });
  }

  // 2. Assign the number to Nexton Burger
  const burger = await prisma.business.findFirst({
    where: { name: "Nexton Burger" }
  });

  if (burger) {
    const updated = await prisma.business.update({
      where: { id: burger.id },
      data: { phoneNumber: "+14782888237" }
    });
    console.log("Updated Nexton Burger:", JSON.stringify(updated, null, 2));
  } else {
    console.log("Nexton Burger not found!");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
