const prisma = require("../config/prisma");

async function seedKB() {
  console.log("🌱 Seeding Knowledge Base...");

  try {
    // 1. Get first business/tenant
    const business = await prisma.business.findFirst({
      include: { tenant: true }
    });

    if (!business) {
      console.error("❌ No business found to seed KB for.");
      return;
    }

    const { tenantId, id: businessId } = business;

    // 2. Create Category
    const category = await prisma.knowledgeCategory.create({
      data: {
        name: "General Support",
        description: "Common questions and help",
        tenantId,
        businessId
      }
    });

    // 3. Create Articles
    const articles = [
      {
        title: "How to book an appointment?",
        content: "You can book an appointment directly through our website by clicking the 'Book Now' button, or by calling us. Our AI assistant can also book it for you right here in the chat!",
        categoryId: category.id,
        tenantId,
        businessId
      },
      {
        title: "Opening Hours",
        content: `Our business hours are as follows:\nMonday - Friday: ${business.openTime} to ${business.closeTime}\nSaturday: 10:00 AM to 4:00 PM\nSunday: Closed`,
        categoryId: category.id,
        tenantId,
        businessId
      },
      {
        title: "Cancellation Policy",
        content: "Orders can be cancelled within 10 minutes of placement. For appointments, please notify us at least 24 hours in advance to avoid a cancellation fee.",
        categoryId: category.id,
        tenantId,
        businessId
      }
    ];

    for (const article of articles) {
      await prisma.knowledgeArticle.create({ data: article });
    }

    // 4. Initialize Support Settings
    await prisma.supportSettings.upsert({
      where: { businessId },
      update: {},
      create: {
        tenantId,
        businessId,
        aiEnabled: true,
        aiName: "Nexton AI",
        aiSystemPrompt: "You are a helpful support agent for " + business.name + ". Use the KB articles to answer questions accurately."
      }
    });

    console.log("✅ KB Seeded successfully for:", business.name);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedKB();
