const prisma = require("../../config/prisma");
const crypto = require("crypto");

/**
 * Normalizes business type to either 'restaurant' or 'appointment'.
 */
function normalizeType(type = "") {
  const lower = (type || "").toLowerCase();
  if (["restaurant", "bakery", "cafe", "pizzeria", "food", "shop", "store", "order", "dish", "burger", "pizza", "sushi", "retail"].some(k => lower.includes(k))) {
    return "restaurant";
  }
  return "appointment";
}

/**
 * Expanded Sub-Type Presets for Order and Appointment Businesses.
 */
const SUBTYPE_PRESETS = {
  // --- ORDER BASED PRESETS ---
  pizzeria: [
    { name: "Pizza Margherita", price: 12.0, description: "Classic tomato sauce, fresh mozzarella, and basil" },
    { name: "Chicken Fajita Pizza", price: 15.0, description: "Grilled chicken, bell peppers, onions, and melted cheese" },
    { name: "Pepperoni Supreme Pizza", price: 16.5, description: "Loaded with crispy pepperoni and mozzarella" },
    { name: "Garlic Bread", price: 5.0, description: "Warm oven-baked garlic bread with herb butter" },
    { name: "Soft Drink", price: 2.5, description: "Ice-cold refreshing beverage" }
  ],
  cafe: [
    { name: "Iced Caramel Macchiato", price: 5.50, description: "Rich espresso with caramel drizzle and chilled milk" },
    { name: "Double Shot Espresso", price: 3.50, description: "Bold dark roast espresso shot" },
    { name: "Butter Croissant", price: 4.00, description: "Freshly baked flaky French butter croissant" },
    { name: "Avocado Sourdough Toast", price: 9.50, description: "Smashed avocado on toasted sourdough with chili flakes" },
    { name: "Iced Matcha Latte", price: 6.00, description: "Premium Japanese matcha green tea with oat milk" }
  ],
  burger: [
    { name: "Double Smash Cheeseburger", price: 11.50, description: "Two smash patties with American cheese, pickles, and secret sauce" },
    { name: "Crispy Spicy Chicken Sandwich", price: 10.50, description: "Fried chicken breast with spicy mayo and coleslaw" },
    { name: "Loaded Seasoned Fries", price: 4.50, description: "Golden crispy fries with house seasoning" },
    { name: "Classic Vanilla Milkshake", price: 4.50, description: "Hand-spun thick vanilla ice cream shake" }
  ],

  // --- APPOINTMENT BASED PRESETS ---
  salon: [
    { name: "Signature Haircut & Styling", price: 35.0, durationMinutes: 30, description: "Wash, haircut, blow-dry, and professional styling" },
    { name: "Beard Trim & Hot Towel Shave", price: 20.0, durationMinutes: 20, description: "Precision beard shaping and warm towel finish" },
    { name: "Full Balayage & Color Gloss", price: 95.0, durationMinutes: 90, description: "Custom hand-painted highlights and gloss treatment" }
  ],
  spa: [
    { name: "60-Min Deep Tissue Massage", price: 85.0, durationMinutes: 60, description: "Therapeutic deep pressure full-body muscle relief" },
    { name: "Hydrating Facial & Skin Treatment", price: 65.0, durationMinutes: 45, description: "Deep cleansing, exfoliation, and serum hydration" },
    { name: "Aromatherapy Wellness Package", price: 120.0, durationMinutes: 90, description: "Full massage, essential oils, and scalp relaxation" }
  ],
  clinic: [
    { name: "General Medical Checkup", price: 75.0, durationMinutes: 30, description: "Comprehensive health review and vital signs check" },
    { name: "Dental Cleaning & Polishing", price: 90.0, durationMinutes: 45, description: "Professional dental hygiene and fluoride treatment" },
    { name: "Specialist Consultation", price: 120.0, durationMinutes: 30, description: "One-on-one medical specialist consultation" }
  ],
  hotel: [
    { name: "Deluxe Ocean View Room Reservation", price: 180.0, durationMinutes: 30, description: "King bed deluxe room with panoramic balcony view" },
    { name: "Private Airport Transfer Shuttle", price: 45.0, durationMinutes: 30, description: "Chauffeur pick-up from airport to hotel" },
    { name: "VIP Late Checkout Pass (2 PM)", price: 35.0, durationMinutes: 15, description: "Extended checkout privilege" }
  ],
  consulting: [
    { name: "30-Min Growth Strategy Call", price: 75.0, durationMinutes: 30, description: "Initial business strategy & marketing roadmap session" },
    { name: "Full Technical Architecture Audit", price: 300.0, durationMinutes: 60, description: "In-depth codebase, infrastructure, and AI audit" },
    { name: "Legal & Regulatory Consultation", price: 150.0, durationMinutes: 45, description: "Legal review and compliance guidance session" }
  ]
};

/**
 * Dynamically allocates an UNASSIGNED phone number for the demo session (STRICT INVENTORY ONLY).
 * NEVER buys new numbers or creates new numbers automatically.
 */
async function allocateDemoPhoneNumber(tenantId, businessId) {
  try {
    // 1. Look for explicit UNASSIGNED phone in system inventory
    let phoneRecord = await prisma.tenantPhoneNumber.findFirst({
      where: {
        status: "UNASSIGNED"
      }
    });

    // 2. If no UNASSIGNED number, check for expired demo numbers and force release them
    if (!phoneRecord) {
      const expiredDemoSessions = await prisma.demoSession.findMany({
        where: { status: "EXPIRED" }
      });

      for (const expiredSession of expiredDemoSessions) {
        await releaseDemoPhoneNumber(expiredSession.businessId, expiredSession.tenantId);
      }

      phoneRecord = await prisma.tenantPhoneNumber.findFirst({
        where: {
          status: "UNASSIGNED"
        }
      });
    }

    if (phoneRecord) {
      await prisma.tenantPhoneNumber.update({
        where: { id: phoneRecord.id },
        data: {
          tenantId: tenantId,
          businessId: businessId,
          status: "DEMO_ACTIVE"
        }
      });
      console.log(`[DEMO_CENTER] Assigned Inventory Phone ${phoneRecord.twilioPhoneNumber} to Demo Tenant ${tenantId}`);
      return phoneRecord.twilioPhoneNumber;
    }
  } catch (err) {
    console.error("[DEMO_CENTER] Phone allocation error:", err.message);
  }

  // Strictly return null if no UNASSIGNED number is available in inventory
  return null;
}

/**
 * Releases a demo phone number back to the UNASSIGNED inventory pool.
 */
async function releaseDemoPhoneNumber(businessId, tenantId) {
  try {
    const masterTenant = await prisma.tenant.findFirst({
      where: { name: { contains: "Platform Hub" } }
    });
    const fallbackTenantId = masterTenant ? masterTenant.id : tenantId;

    const released = await prisma.tenantPhoneNumber.updateMany({
      where: {
        OR: [
          { businessId: businessId },
          { tenantId: tenantId, status: "DEMO_ACTIVE" }
        ]
      },
      data: {
        tenantId: fallbackTenantId,
        businessId: null,
        status: "UNASSIGNED"
      }
    });

    if (released.count > 0) {
      console.log(`[DEMO_CENTER] Released ${released.count} demo phone number(s) back to UNASSIGNED inventory.`);
    }
  } catch (err) {
    console.error("[DEMO_CENTER] Release phone error:", err.message);
  }
}

/**
 * Creates a complete isolated demo environment.
 */
async function createDemoSession(data) {
  const {
    businessName,
    businessType = "restaurant",
    subType = "pizzeria",
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
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours

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

  // 2. Create Demo Business
  const greeting = customGreeting || (
    normalizedType === "restaurant"
      ? `Thank you for calling ${businessName}! My name is ${aiName}. How can I assist you with your order today?`
      : `Thank you for calling ${businessName}! My name is ${aiName}. I can help you schedule an appointment or check service availability. How may I help you?`
  );

  const business = await prisma.business.create({
    data: {
      name: businessName,
      type: normalizedType,
      subType: subType,
      phoneNumber: "UNASSIGNED",
      city: city,
      country: country,
      aiName: aiName,
      aiPersonality: "professional_friendly",
      aiVoiceId: "agent_9401kqqj87jzf9mrmfwsprqh3frh",
      tenantId: tenant.id,
      timings: "Mon-Fri: 9am-6pm, Sat: 10am-4pm, Sun: Closed"
    }
  });

  // 3. Dynamically Allocate Unassigned Phone Number (STRICT INVENTORY ONLY)
  const assignedPhone = await allocateDemoPhoneNumber(tenant.id, business.id);

  if (!assignedPhone) {
    // Purge temporary demo tenant and business to prevent orphan records
    await prisma.business.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });

    console.warn(`[DEMO_CENTER] All system numbers are busy. No UNASSIGNED inventory phone available for demo creation.`);
    return {
      success: false,
      code: "NUMBERS_BUSY",
      message: "Currently, all our system demo phone lines are busy with active prospect testing."
    };
  }

  // Expire any existing active demo sessions registered under this phone number to avoid collisions
  await prisma.demoSession.updateMany({
    where: {
      phoneNumber: assignedPhone,
      status: "ACTIVE"
    },
    data: { status: "EXPIRED" }
  });

  // Update business phone number
  await prisma.business.update({
    where: { id: business.id },
    data: { phoneNumber: assignedPhone }
  });

  // 4. Seed Business Items (Menu or Services) using subType presets
  if (normalizedType === "restaurant") {
    const category = await prisma.menuCategory.create({
      data: {
        name: "Main Menu",
        businessId: business.id,
        tenantId: tenant.id
      }
    });

    const presetItems = SUBTYPE_PRESETS[subType] || SUBTYPE_PRESETS.pizzeria;
    const defaultItems = menuItems.length > 0 ? menuItems : presetItems;

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

    const presetServices = SUBTYPE_PRESETS[subType] || SUBTYPE_PRESETS.salon;
    const defaultServices = services.length > 0 ? services : presetServices;

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

  // 5. Create DemoSession Record (12-Hour Expiration)
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

  // 🚀 Send Professional 12-Hour Confirmation Email with Dashboard Access Link
  const emailService = require("../../services/email.service");
  emailService.sendDemoConfirmationEmail({
    email,
    contactName: ownerName,
    businessName,
    businessType: normalizedType,
    aiName,
    phoneNumber: assignedPhone,
    token
  }).catch(err => console.error("[DEMO_EMAIL_ERR]", err.message));

  console.log(`[DEMO_CENTER] Created 12-Hour DemoSession ${session.id} for "${businessName}" on Number ${assignedPhone} (Token: ${token})`);
  return { success: true, session, token };
}

/**
 * Fetches demo session by token with server-side expiration checks and phone release.
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

    // 🚀 Release Phone Number back to unassigned inventory!
    await releaseDemoPhoneNumber(session.businessId, session.tenantId);

    // 📩 Send Expiration Email to Demo Owner
    if (session.email) {
      const emailService = require("../../services/email.service");
      let reason = "12_HOURS_EXPIRED";
      if (session.callCount >= session.maxCalls) reason = "5_CALLS_REACHED";
      
      await emailService.sendDemoExpirationEmail({
        email: session.email,
        contactName: session.contactName,
        businessName: session.businessName,
        phoneNumber: session.phoneNumber || "+18884918668",
        reason
      }).catch(err => console.error("[DEMO_EMAIL_EXPIRE_ERR]", err.message));
    }
  }

  return {
    ...session,
    isExpired,
    remainingSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000))
  };
}

/**
 * Increments call count and cumulative call duration for a demo session.
 * Enforces all 3 termination rules:
 * 1. 5 Calls Completed
 * 2. 10 Minutes Total Call Duration Completed (600 seconds)
 * 3. 12-Hour Expiration Window Completed
 */
async function recordDemoCall(businessId, callDurationSeconds = 0) {
  const emailService = require("../../services/email.service");

  const session = await prisma.demoSession.findFirst({
    where: { businessId, status: "ACTIVE" }
  });

  if (!session) return null;

  // Calculate cumulative duration across calls for this demo business
  const aggregate = await prisma.call.aggregate({
    where: { businessId },
    _sum: { duration: true }
  });
  const totalCallSeconds = (aggregate._sum.duration || 0) + (parseInt(callDurationSeconds) || 0);
  const updatedCallCount = session.callCount + 1;

  const now = new Date();
  const maxDurationSeconds = (session.maxCallDuration || 10) * 60; // 10 minutes = 600s

  let shouldExpire = false;
  let expireReason = "12_HOURS_EXPIRED";

  if (updatedCallCount >= session.maxCalls) {
    shouldExpire = true;
    expireReason = "5_CALLS_REACHED";
  } else if (totalCallSeconds >= maxDurationSeconds) {
    shouldExpire = true;
    expireReason = "10_MINS_REACHED";
  } else if (session.expiresAt <= now) {
    shouldExpire = true;
    expireReason = "12_HOURS_EXPIRED";
  }

  const updated = await prisma.demoSession.update({
    where: { id: session.id },
    data: {
      callCount: updatedCallCount,
      status: shouldExpire ? "EXPIRED" : "ACTIVE"
    }
  });

  if (shouldExpire) {
    console.log(`[DEMO_CENTER] Expiring DemoSession ${session.id} (${session.businessName}). Reason: ${expireReason}`);
    
    // 🚀 Release Phone Number back to unassigned inventory pool!
    await releaseDemoPhoneNumber(session.businessId, session.tenantId);

    // 📩 Send Expiration Email to Demo Owner
    if (session.email) {
      await emailService.sendDemoExpirationEmail({
        email: session.email,
        contactName: session.contactName,
        businessName: session.businessName,
        phoneNumber: session.phoneNumber || "+18884918668",
        reason: expireReason
      }).catch(err => console.error("[DEMO_EMAIL_EXPIRE_ERR]", err.message));
    }
  }

  return updated;
}

/**
 * Background sweeper: Checks for expired demo sessions, releases phone numbers, and sends emails.
 */
async function checkAndCleanupExpiredDemos() {
  const emailService = require("../../services/email.service");
  const now = new Date();

  try {
    const expiredSessions = await prisma.demoSession.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lte: now }
      }
    });

    for (const session of expiredSessions) {
      await prisma.demoSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" }
      });

      console.log(`[DEMO_CENTER] Background Sweeper expired DemoSession ${session.id} (${session.businessName})`);

      // 🚀 Release Phone Number back to unassigned inventory pool!
      await releaseDemoPhoneNumber(session.businessId, session.tenantId);

      // 📩 Send Expiration Email to Demo Owner
      if (session.email) {
        await emailService.sendDemoExpirationEmail({
          email: session.email,
          contactName: session.contactName,
          businessName: session.businessName,
          phoneNumber: session.phoneNumber || "+18884918668",
          reason: "12_HOURS_EXPIRED"
        }).catch(err => console.error("[DEMO_SWEEPER_EMAIL_ERR]", err.message));
      }
    }
  } catch (err) {
    console.error("[DEMO_SWEEPER_ERR]", err.message);
  }
}

/**
 * Manually deactivates demo session and releases phone number.
 */
async function deactivateSession(token) {
  const session = await prisma.demoSession.findUnique({ where: { token } });
  if (!session) return null;

  const updated = await prisma.demoSession.update({
    where: { id: session.id },
    data: { status: "EXPIRED" }
  });

  // 🚀 Release Phone Number back to unassigned inventory!
  await releaseDemoPhoneNumber(session.businessId, session.tenantId);

  if (session.email) {
    const emailService = require("../../services/email.service");
    await emailService.sendDemoExpirationEmail({
      email: session.email,
      contactName: session.contactName,
      businessName: session.businessName,
      phoneNumber: session.phoneNumber || "+18884918668",
      reason: "MANUALLY_RELEASED"
    }).catch(err => console.error("[DEMO_EMAIL_EXPIRE_ERR]", err.message));
  }

  return updated;
}

/**
 * Extends a demo session by 24 hours (Admin helper).
 */
async function extendSession(token) {
  const session = await prisma.demoSession.findUnique({ where: { token } });
  if (!session) return null;

  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const updated = await prisma.demoSession.update({
    where: { id: session.id },
    data: { status: "ACTIVE", expiresAt: newExpires }
  });

  // Re-allocate phone if it was unassigned
  await allocateDemoPhoneNumber(session.tenantId, session.businessId);

  return updated;
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
  checkAndCleanupExpiredDemos,
  deactivateSession,
  extendSession,
  listAllDemoSessions,
  allocateDemoPhoneNumber,
  releaseDemoPhoneNumber,
  SUBTYPE_PRESETS
};
