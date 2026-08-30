const prisma = require("../../config/prisma");
const crypto = require("crypto");

/**
 * Normalizes business type to either 'restaurant' or 'appointment'.
 */
function normalizeType(type = "") {
  const lower = (type || "").toLowerCase();
  if (["restaurant", "bakery", "cafe", "pizzeria", "food", "shop", "store", "order", "dish", "burger", "pizza", "sushi"].some(k => lower.includes(k))) {
    return "restaurant";
  }
  return "appointment";
}

/**
 * Creates a complete isolated demo environment.
 */
async function createDemoSession(data) {
  const {
    businessName,
    businessType = "restaurant",
    city = "San Francisco",
    country = "USA",
    ownerName = "Demo User",
    email = "demo@naxton.ai",
    phone = "",
    aiName = "Sarah",
    customGreeting = "",
    menuItems = [],
    services = []
  } = data;

  const normalizedType = normalizeType(businessType);
  const token = `demo_${crypto.randomBytes(12).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // 1. Create Isolated Demo Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: `${businessName} (Demo Tenant)`,
      plan: "nexa-prime",
      isDemoAccount: true,
      monthlyLimit: 50,
      monthlyTokenLimit: 500,
      tokenBalance: 100
    }
  });

  // 2. Determine assigned phone number from Twilio inventory or fallback
  let assignedPhone = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_DEMO_NUMBER || "+18005550199";
  const availableProxy = await prisma.tenantPhoneNumber.findFirst({
    where: { status: "ACTIVE" }
  });
  if (availableProxy) {
    assignedPhone = availableProxy.twilioPhoneNumber || availableProxy.businessPhoneNumber || assignedPhone;
  }

  // 3. Create Demo Business
  const greeting = customGreeting || (
    normalizedType === "restaurant"
      ? `Thank you for calling ${businessName}! My name is ${aiName}. How can I assist you with your order today?`
      : `Thank you for calling ${businessName}! My name is ${aiName}. I can help you schedule an appointment or check service availability. How may I help you?`
  );

  const business = await prisma.business.create({
    data: {
      name: businessName,
      type: normalizedType,
      phoneNumber: assignedPhone,
      city: city,
      country: country,
      aiName: aiName,
      aiPersonality: "professional_friendly",
      tenantId: tenant.id,
      timings: "Mon-Fri: 9am-6pm, Sat: 10am-4pm, Sun: Closed"
    }
  });

  // 4. Seed Business Items (Menu or Services)
  if (normalizedType === "restaurant") {
    const category = await prisma.menuCategory.create({
      data: {
        name: "Main Menu",
        businessId: business.id,
        tenantId: tenant.id
      }
    });

    const defaultItems = menuItems.length > 0 ? menuItems : [
      { name: "Pizza Margherita", price: 12.0, description: "Classic tomato sauce, fresh mozzarella, and basil" },
      { name: "Chicken Fajita Pizza", price: 15.0, description: "Grilled chicken, bell peppers, onions, and melted cheese" },
      { name: "Pepperoni Pizza", price: 16.0, description: "Loaded with crispy pepperoni and mozzarella" },
      { name: "Garlic Bread", price: 5.0, description: "Warm oven-baked garlic bread with herb butter" },
      { name: "Soft Drink", price: 2.5, description: "Ice-cold refreshing beverage" }
    ];

    for (let i = 0; i < defaultItems.length; i++) {
      const item = defaultItems[i];
      await prisma.menuItem.create({
        data: {
          name: item.name,
          price: parseFloat(item.price) || 10.0,
          description: item.description || "",
          isAvailable: true,
          displayOrder: i,
          categoryId: category.id,
          businessId: business.id,
          tenantId: tenant.id
        }
      });
    }
  } else {
    const serviceCategory = await prisma.serviceCategory.create({
      data: {
        name: "Core Services",
        businessId: business.id,
        tenantId: tenant.id
      }
    });

    const defaultServices = services.length > 0 ? services : [
      { name: "Haircut & Styling", price: 25.0, durationMinutes: 30, description: "Professional haircut and hair styling session" },
      { name: "Beard Trim & Grooming", price: 15.0, durationMinutes: 20, description: "Precision beard shaping and facial hair grooming" },
      { name: "Full Color & Highlight", price: 65.0, durationMinutes: 60, description: "Complete hair coloring and highlight treatment" }
    ];

    for (let i = 0; i < defaultServices.length; i++) {
      const s = defaultServices[i];
      await prisma.appointmentService.create({
        data: {
          name: s.name,
          price: parseFloat(s.price) || 25.0,
          durationMinutes: parseInt(s.durationMinutes) || 30,
          duration: parseInt(s.durationMinutes) || 30,
          description: s.description || "",
          isAvailable: true,
          isActive: true,
          categoryId: serviceCategory.id,
          businessId: business.id,
          tenantId: tenant.id
        }
      });
    }
  }

  // 5. Create DemoSession Record
  const session = await prisma.demoSession.create({
    data: {
      token,
      tenantId: tenant.id,
      businessId: business.id,
      businessType: normalizedType,
      businessName,
      contactName: ownerName,
      email,
      phone,
      aiName,
      greeting,
      phoneNumber: assignedPhone,
      status: "ACTIVE",
      maxCalls: 5,
      callCount: 0,
      maxCallDuration: 10,
      expiresAt
    }
  });

  console.log(`[DEMO_CENTER] Created DemoSession ${session.id} for "${businessName}" (Token: ${token})`);
  return { success: true, session, token };
}

/**
 * Fetches demo session by token with server-side expiration checks.
 */
async function getSessionByToken(token) {
  if (!token) return null;

  const session = await prisma.demoSession.findUnique({
    where: { token },
    include: {
      business: {
        include: {
          menuItems: true,
          appointmentServices: true,
          orders: {
            orderBy: { createdAt: "desc" },
            include: { items: { include: { menuItem: true } } }
          },
          appointments: {
            orderBy: { appointmentTime: "desc" },
            include: { service: true }
          },
          calls: {
            orderBy: { createdAt: "desc" },
            take: 10
          }
        }
      }
    }
  });

  if (!session) return null;

  // Server-side Expiration Check
  const now = new Date();
  const isExpired = session.expiresAt < now || session.callCount >= session.maxCalls || session.status === "EXPIRED";

  if (isExpired && session.status !== "EXPIRED") {
    await prisma.demoSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" }
    });
    session.status = "EXPIRED";
  }

  return {
    ...session,
    isExpired,
    remainingSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000))
  };
}

/**
 * Increments call count for demo session.
 */
async function recordDemoCall(businessId) {
  const session = await prisma.demoSession.findFirst({
    where: { businessId, status: "ACTIVE" }
  });

  if (!session) return null;

  const updated = await prisma.demoSession.update({
    where: { id: session.id },
    data: {
      callCount: { increment: 1 }
    }
  });

  if (updated.callCount >= updated.maxCalls) {
    await prisma.demoSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" }
    });
  }

  return updated;
}

/**
 * Manually deactivates demo session.
 */
async function deactivateSession(token) {
  const session = await prisma.demoSession.findUnique({ where: { token } });
  if (!session) return null;

  return await prisma.demoSession.update({
    where: { id: session.id },
    data: { status: "EXPIRED" }
  });
}

/**
 * Extends a demo session by 24 hours (Admin helper).
 */
async function extendSession(token) {
  const session = await prisma.demoSession.findUnique({ where: { token } });
  if (!session) return null;

  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return await prisma.demoSession.update({
    where: { id: session.id },
    data: { status: "ACTIVE", expiresAt: newExpires }
  });
}

/**
 * Lists all demo sessions for Admin Demo Center.
 */
async function listAllDemoSessions(options = {}) {
  const { status, limit = 50, page = 1, search } = options;
  const where = {};

  if (status) where.status = status;
  if (search) {
    where.OR = [
      { businessName: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } }
    ];
  }

  const [total, demos] = await Promise.all([
    prisma.demoSession.count({ where }),
    prisma.demoSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        business: {
          select: {
            _count: {
              select: { orders: true, appointments: true, calls: true }
            }
          }
        }
      }
    })
  ]);

  return { total, demos, page, limit };
}

module.exports = {
  createDemoSession,
  getSessionByToken,
  recordDemoCall,
  deactivateSession,
  extendSession,
  listAllDemoSessions
};
