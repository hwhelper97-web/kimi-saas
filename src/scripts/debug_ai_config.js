const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.globalAiSettings.findUnique({ where: { id: "global" } });
  console.log(JSON.stringify(settings, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
