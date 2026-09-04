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
async function getCallRoute(toNumber, forwardedFrom = "") {
  const normalizedTo = (toNumber || "").replace(/[^0-9]/g, "").slice(-10);
  const normalizedForwarded = (forwardedFrom || "").replace(/[^0-9]/g, "").slice(-10);
  
  // 1. FIRST PRIORITY: Active Tenant Provisioned Phone Line in Inventory (by Twilio number or Business number)
  let phoneConfig = await prisma.tenantPhoneNumber.findFirst({
    where: { 
      OR: [
        { twilioPhoneNumber: { contains: normalizedTo } },
        ...(normalizedForwarded ? [
          { businessPhoneNumber: { contains: normalizedForwarded } },
          { twilioPhoneNumber: { contains: normalizedForwarded } }
        ] : [])
      ],
      status: "ACTIVE",
      businessId: { not: null }
    },
    include: { business: true }
  });

  if (phoneConfig && phoneConfig.business) {
    console.log(`[ROUTING] Matched active tenant phone line for business: ${phoneConfig.business.name}`);

    // Check AI Answering Toggle
    if (!phoneConfig.aiEnabled) {
      return { 
        action: 'FORWARD', 
        destination: phoneConfig.transferNumber || phoneConfig.businessPhoneNumber, 
        business: phoneConfig.business,
        config: phoneConfig 
      };
    }

    // Check Business Hours
    const isOpen = isWithinBusinessHours(phoneConfig.businessHours, phoneConfig.business?.timezone || 'UTC');
    if (!isOpen && phoneConfig.forwardingEnabled) {
      return { 
        action: 'FORWARD', 
        destination: phoneConfig.transferNumber || phoneConfig.businessPhoneNumber, 
        business: phoneConfig.business,
        config: phoneConfig 
      };
    }

    return { action: 'AI', business: phoneConfig.business, config: phoneConfig };
  }

  // 2. SECOND PRIORITY: Check for Virtual Demo Lab Sessions (Sandbox Demos)
  const activeDemo = await prisma.demoSession.findFirst({
    where: {
      OR: [
        { phoneNumber: { contains: normalizedTo } },
        ...(normalizedForwarded ? [{ phoneNumber: { contains: normalizedForwarded } }] : [])
      ],
      status: "ACTIVE"
    },
    orderBy: { createdAt: "desc" },
    include: { business: true }
  });

  if (activeDemo) {
    const now = new Date();
    const isExpired = activeDemo.expiresAt < now || activeDemo.callCount >= activeDemo.maxCalls || activeDemo.status === "EXPIRED";

    if (isExpired) {
      if (activeDemo.status !== "EXPIRED") {
        await prisma.demoSession.update({ where: { id: activeDemo.id }, data: { status: "EXPIRED" } });
      }
      return { action: 'EXPIRED_DEMO', business: activeDemo.business, config: null };
    }

    // Record call start for active demo session
    await prisma.demoSession.update({
      where: { id: activeDemo.id },
      data: { callCount: { increment: 1 } }
    });

    console.log(`[ROUTING] Active Demo Matched: ${activeDemo.businessName} (Session: ${activeDemo.token})`);
    return { action: 'AI', business: activeDemo.business, config: null, demo: activeDemo };
  }

  // 3. THIRD PRIORITY: Match by Business Phone Number directly
  const targetBusiness = await prisma.business.findFirst({
    where: {
      OR: [
        { phoneNumber: { contains: normalizedTo } },
        ...(normalizedForwarded ? [{ phoneNumber: { contains: normalizedForwarded } }] : [])
      ]
    }
  });

  if (targetBusiness) {
    return { action: 'AI', business: targetBusiness, config: null };
  }

  // 4. FALLBACK: Unregistered Sandbox Call -> Route to Default AI Receptionist
  console.warn(`[ROUTING] Unregistered number called: ${toNumber} (ForwardedFrom: ${forwardedFrom}). Routing to default AI receptionist.`);
  return { action: 'AI', business: null, config: null };
}

module.exports = { isWithinBusinessHours, getCallRoute };
