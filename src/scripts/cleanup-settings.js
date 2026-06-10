const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Checking for invalid 'null' strings in settings...");
  
  const settings = await prisma.systemSetting.findMany({
    where: {
      OR: [
        { value: "null" },
        { value: "undefined" }
      ]
    }
  });

  if (settings.length === 0) {
    console.log("✅ No invalid settings found.");
    return;
  }

  console.log(`🧹 Found ${settings.length} invalid entries. Cleaning up...`);

  for (const s of settings) {
    await prisma.systemSetting.update({
      where: { id: s.id },
      data: { value: "" }
    });
    console.log(`   - Fixed key: ${s.key}`);
  }

  console.log("✨ Database cleanup complete.");
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
