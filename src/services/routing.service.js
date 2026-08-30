const prisma = require('../config/prisma');

/**
 * Validates if the current time is within business hours.
 */
function isWithinBusinessHours(hours, timezone = 'UTC') {
  if (!hours) return true;

  try {
    const now = new Date();
    const options = { weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    
    const day = parts.find(p => p.type === 'weekday').value.toLowerCase();
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const timeStr = `${hour}:${minute}`;
    
    const todayHours = hours[day];
    if (!todayHours || todayHours.closed) return false;
    
    return timeStr >= todayHours.open && timeStr <= todayHours.close;
  } catch (err) {
    console.error("[RoutingService] Business hours validation failed:", err.message);
    return true;
  }
}

/**
 * Determines the routing action for an incoming call.
 * @param {String} toNumber - The number being called
 * @returns {Object} { action: 'AI' | 'FORWARD' | 'EXPIRED_DEMO', destination: String, business: Object }
 */
async function getCallRoute(toNumber) {
  const normalizedTo = (toNumber || "").replace(/[^0-9]/g, "").slice(-10);
  
  // 1. FIRST: Check if this phone number belongs to an active DemoSession!
  const activeDemo = await prisma.demoSession.findFirst({
    where: {
      phoneNumber: { contains: normalizedTo },
      status: "ACTIVE"
    },
    orderBy: { createdAt: "desc" },
    include: { business: true }
  });

  // 2. SECOND: Look up Phone Number Config in inventory
  const phoneConfig = await prisma.tenantPhoneNumber.findFirst({
    where: { twilioPhoneNumber: { contains: normalizedTo } },
    include: { business: true }
  });

  let targetBusiness = activeDemo ? activeDemo.business : (phoneConfig ? phoneConfig.business : await prisma.business.findFirst({
    where: { phoneNumber: { contains: normalizedTo } }
  }));

  // Handle Demo Session Logic
  if (activeDemo || targetBusiness) {
    const demo = activeDemo || await prisma.demoSession.findFirst({
      where: { businessId: targetBusiness?.id },
      orderBy: { createdAt: "desc" }
    });

    if (demo) {
      const now = new Date();
      const isExpired = demo.expiresAt < now || demo.callCount >= demo.maxCalls || demo.status === "EXPIRED";

      if (isExpired) {
        if (demo.status !== "EXPIRED") {
          await prisma.demoSession.update({ where: { id: demo.id }, data: { status: "EXPIRED" } });
        }
        return { action: 'EXPIRED_DEMO', business: targetBusiness, config: phoneConfig };
      }

      // Record call start for active demo session
      await prisma.demoSession.update({
        where: { id: demo.id },
        data: { callCount: { increment: 1 } }
      });

      console.log(`[ROUTING] Active Demo Matched: ${demo.businessName} (Session: ${demo.token})`);
      return { action: 'AI', business: targetBusiness, config: phoneConfig, demo };
    }
  }

  if (!phoneConfig && !targetBusiness) {
    console.warn(`[ROUTING] Unregistered number called: ${toNumber}. Falling back to default AI handler.`);
    return { action: 'AI', business: null, config: null };
  }

  // Check AI Answering Toggle
  if (phoneConfig && !phoneConfig.aiEnabled) {
    return { 
      action: 'FORWARD', 
      destination: phoneConfig.transferNumber || phoneConfig.businessPhoneNumber, 
      business: phoneConfig.business,
      config: phoneConfig 
    };
  }

  // Check Business Hours
  if (phoneConfig) {
    const isOpen = isWithinBusinessHours(phoneConfig.businessHours, phoneConfig.business?.timezone || 'UTC');
    if (!isOpen && phoneConfig.forwardingEnabled) {
      return { 
        action: 'FORWARD', 
        destination: phoneConfig.transferNumber || phoneConfig.businessPhoneNumber, 
        business: phoneConfig.business,
        config: phoneConfig 
      };
    }
  }

  return { action: 'AI', business: targetBusiness, config: phoneConfig };
}

module.exports = { isWithinBusinessHours, getCallRoute };
