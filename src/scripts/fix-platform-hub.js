const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixPlatformHub() {
  console.log("🛠️ Repairing Platform Hub Infrastructure...");
  
  try {
    const hub = await prisma.tenant.findFirst({ where: { name: "Naxton Platform Hub" } });
    if (!hub) return console.log("❌ Hub not found.");
    
    // Check if business exists
    const biz = await prisma.business.findFirst({ where: { tenantId: hub.id } });
    if (!biz) {
      await prisma.business.create({
        data: {
          tenantId: hub.id,
          name: "Platform Intelligence Node",
          type: "platform",
          phoneNumber: "GLOBAL_SYSTEM",
          isMainBranch: true
        }
      });
      console.log("✅ Created Platform Intelligence Node for support routing.");
    } else {
      console.log("✅ Platform Node already active.");
    }
  } catch (e) {
    console.error("❌ Fix failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

fixPlatformHub();
