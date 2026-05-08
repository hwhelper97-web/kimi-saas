const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const business = await prisma.business.findFirst({
      where: { name: { contains: 'New York Pizza' } },
      include: { menuItems: true }
    });

    if (!business) {
      console.log("Business not found");
      return;
    }

    console.log(`Found Business: ${business.name} (ID: ${business.id}, Tenant: ${business.tenantId})`);

    // 🚀 UPGRADE BUSINESS TO V2 ENGINE
    await prisma.business.update({
      where: { id: business.id },
      data: { 
        aiVoice: "eleven_v2", 
        aiVoiceId: "agent_9401kqqj87jzf9mrmfwsprqh3frh" 
      }
    });
    console.log("✅ Business Upgraded to V2 Agent Engine");

    // Create a demo order
    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        tenantId: business.tenantId,
        customerName: "Ahmad khan",
        total: 25.50,
        customerPhone: "+15550199",
        items: {
          create: [
            {
              menuItemId: business.menuItems[0]?.id || "unknown",
              tenantId: business.tenantId,
              quantity: 1,
              unitPrice: 15.00
            },
            {
              menuItemId: business.menuItems[1]?.id || "unknown",
              tenantId: business.tenantId,
              quantity: 2,
              unitPrice: 5.25
            }
          ]
        }
      }
    });

    console.log(`✅ Demo Order Created: ID ${order.id}`);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
