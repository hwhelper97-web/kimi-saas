const prisma = require("../config/prisma");

async function seedSettings() {
  const settings = [
    // General
    { key: "platformName", value: "Naxton AI Platform", group: "GENERAL", type: "string" },
    { key: "supportEmail", value: "admin@naxton.ai", group: "GENERAL", type: "string" },
    { key: "timezone", value: "UTC", group: "GENERAL", type: "string" },
    { key: "currency", value: "USD", group: "GENERAL", type: "string" },
    
    // AI
    { key: "openaiModel", value: "gpt-4o", group: "AI", type: "string" },
    { key: "openaiTemperature", value: "0.7", group: "AI", type: "number" },
    { key: "maxTokens", value: "2048", group: "AI", type: "number" },
    
    // Voice
    { key: "defaultVoice", value: "nova", group: "VOICE", type: "string" },
    { key: "callRecordingEnabled", value: "true", group: "VOICE", type: "boolean" },
    
    // Tenant
    { key: "trialDays", value: "14", group: "TENANT", type: "number" },
    { key: "maxBusinesses", value: "5", group: "TENANT", type: "number" },
    
    // Features
    { key: "enableAiSupport", value: "true", group: "FEATURES", type: "boolean" },
    { key: "enableVoiceLabs", value: "false", group: "FEATURES", type: "boolean" }
  ];

  console.log("Seeding platform settings...");

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s
    });
  }

  console.log("Settings seeded successfully!");
}

seedSettings()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
