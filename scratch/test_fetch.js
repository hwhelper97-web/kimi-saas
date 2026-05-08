const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const business = await prisma.business.findFirst({
      where: { id: "6e05e7c7-c495-4afc-aa4b-c890e6837787" },
      include: {
        menuItems: { include: { sizes: true, addons: true } },
      },
    });
    console.log("Success:", !!business);
    if (business) console.log("Timezone:", business.timezone);
  } catch (err) {
    console.error("Error detected:", err.message);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
