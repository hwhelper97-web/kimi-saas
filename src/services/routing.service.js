const prisma = require('../config/prisma');

/**
 * Validates if the current time is within business hours.
 * @param {Object} hours - JSON object containing hours (e.g., { monday: { open: "09:00", close: "17:00" }, ... })
 * @param {String} timezone - Business timezone
 * @returns {Boolean}
 */
function isWithinBusinessHours(hours, timezone = 'UTC') {
  if (!hours) return true; // Default to open if no hours configured

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
    return true; // Fail open
  }
}

/**
 * Determines the routing action for an incoming call.
 * @param {String} toNumber - The number being called
 * @returns {Object} { action: 'AI' | 'FORWARD', destination: String, business: Object }
 */
async function getCallRoute(toNumber) {
  const normalizedTo = toNumber.replace(/[^0-9]/g, "").slice(-10);
  
  // 1. Find the Phone Number Config
  const phoneConfig = await prisma.tenantPhoneNumber.findFirst({
    where: { twilioPhoneNumber: { contains: normalizedTo } },
    include: { business: true }
  });

  if (!phoneConfig) {
    // Fallback to legacy Business lookup
    const business = await prisma.business.findFirst({
      where: { phoneNumber: { contains: normalizedTo } }
    });
    return { action: 'AI', business, config: null };
  }

  // 2. Check AI answering toggle
  if (!phoneConfig.aiEnabled) {
    return { 
      action: 'FORWARD', 
      destination: phoneConfig.transferNumber || phoneConfig.businessPhoneNumber, 
      business: phoneConfig.business,
      config: phoneConfig 
    };
  }

  // 3. Check Business Hours
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

module.exports = { isWithinBusinessHours, getCallRoute };
