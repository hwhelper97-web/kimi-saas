const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Tenant Support Conversations...");

  // 1. Get a tenant
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error("❌ No tenant found. Please run seed-kb.js first.");
    return;
  }

  const business = await prisma.business.findFirst({ where: { tenantId: tenant.id } });

  // 2. Create a "Tenant Customer" (the tenant acting as a support seeker)
  const tenantCustomer = await prisma.customer.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "owner@visionsaloon.com" } },
    update: {},
    create: {
      name: "Vision Saloon Owner",
      email: "owner@visionsaloon.com",
      phone: "Platform Tenant",
      tenantId: tenant.id
    }
  });

  // 3. Create a Conversation
  const convo = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      businessId: business.id,
      customerId: tenantCustomer.id,
      status: "open",
      priority: "high",
      aiHandled: true,
      messages: {
        create: [
          {
            senderType: "CUSTOMER",
            content: "Hi, I'm having trouble setting up my Twilio number. Can you help?",
          },
          {
            senderType: "AI",
            content: "Hello! I'm the Naxton Platform Assistant. I'd be happy to help with your Twilio integration. Have you already added your Account SID to the Business Settings?",
          }
        ]
      }
    }
  });

  // 4. Create another one
  await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      businessId: business.id,
      customerId: tenantCustomer.id,
      status: "open",
      priority: "medium",
      aiHandled: false,
      messages: {
        create: [
          {
            senderType: "CUSTOMER",
            content: "I need to upgrade my plan to Pro. How do I do that?",
          }
        ]
      }
    }
  });

  console.log("✅ Seeded 2 support conversations for the SuperAdmin Inbox.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
