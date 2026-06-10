const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🛠️ Fixing incorrect setting types in database...");
  
  const numericKeys = ["logRetentionDays", "apiRateLimit", "aiLimitPerMonth", "storageLimit", "trialDays", "maxBusinesses", "maxTokens", "openaiTemperature", "silenceTimeout"];

  for (const key of numericKeys) {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    if (setting && setting.type === "json") {
      await prisma.systemSetting.update({
        where: { key },
        data: { 
          type: "number",
          value: setting.value === "" ? "0" : setting.value
        }
      });
      console.log(`✅ Fixed type for: ${key}`);
    }
  }

  console.log("✨ Type correction complete.");
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
