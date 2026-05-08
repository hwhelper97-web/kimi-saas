const prisma = require("../config/prisma");
const { sendOrderSms } = require("../services/sms.service");
require('dotenv').config();

async function simulateOrder(customerName, customerPhone) {
  console.log(`🚀 Simulating Real-World Order for: ${customerName} (${customerPhone})...`);
  
  try {
    // 1. Get an active business with SMS enabled
    let business = await prisma.business.findFirst({
      where: { orderSmsEnabled: true }
    });

    if (!business) {
      console.log("Enabling SMS for the first available business...");
      const firstBiz = await prisma.business.findFirst();
      business = await prisma.business.update({
        where: { id: firstBiz.id },
        data: { orderSmsEnabled: true }
      });
    }

    console.log(`📍 Business: ${business.name}`);

    // 2. Create a REAL order in the database (linked to the business)
    // We'll pick a real menu item if possible
    const menuItem = await prisma.menuItem.findFirst({
      where: { businessId: business.id }
    });

    const total = menuItem ? menuItem.price : 19.99;
    const itemName = menuItem ? menuItem.name : "Special Item";

    console.log("📦 Creating database records...");
    const order = await prisma.order.create({
      data: {
        customerName,
        customerPhone,
        total,
        businessId: business.id,
        tenantId: business.tenantId,
        items: {
          create: [{
            menuItemId: menuItem ? menuItem.id : (await prisma.menuItem.findFirst()).id,
            quantity: 1,
            tenantId: business.tenantId
          }]
        }
      },
      include: { items: { include: { menuItem: true } } }
    });

    console.log(`✅ Order #${order.id} saved to database.`);

    // 3. Trigger the SMS (Exactly how the AI controller does it)
    console.log(`📤 Dispatching AI Summary to ${customerPhone}...`);
    
    const itemsForSms = order.items.map(it => ({
      name: it.menuItem.name,
      quantity: it.quantity
    }));

    const result = await sendOrderSms(
      customerPhone,
      business.name,
      itemsForSms,
      order.total,
      business.currency || "USD"
    );

    if (result) {
      console.log("🌟 SUCCESS! SMS delivered via Twilio.");
      console.log("Message SID:", result.sid);
    } else {
      console.log("⚠️ SMS failed. Check Twilio logs.");
    }

  } catch (error) {
    console.error("❌ Simulation failed:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run for both numbers requested by user
(async () => {
  // Attempt 1: International Number
  await simulateOrder("Syed (Intl)", "+923109797771");
  
  console.log("\n-------------------\n");
  
  // Attempt 2: Local US Number
  await simulateOrder("Syed (Local)", "+15102097657");
})();
