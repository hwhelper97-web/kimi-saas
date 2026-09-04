const twilio = require("twilio");
const prisma = require("../config/prisma");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let client = null;
if (accountSid && authToken && accountSid.startsWith("AC")) {
  try {
    client = twilio(accountSid, authToken);
  } catch (err) {
    console.warn("[TWILIO_INIT_WARN] Failed to initialize Twilio client:", err.message);
  }
}

/**
 * Gets the active system base URL for webhooks.
 */
function getSystemBaseUrl() {
  let url = process.env.APP_URL || process.env.SERVER_URL || process.env.BASE_URL || "https://naxtontechnologies.com";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url.replace(/\/$/, "");
}

/**
 * hangupCall
 */
async function hangupCall(callSid) {
  if (!client || !callSid) return;
  try {
    await client.calls(callSid).update({ status: "completed" });
  } catch (err) {
    console.error(`[Twilio] Failed to hangup call ${callSid}:`, err.message);
  }
}

/**
 * startRecording
 */
async function startRecording(callSid) {
  if (!client || !callSid) return;
  try {
    await client.calls(callSid).recordings.create({
      recordingChannels: "dual",
      recordingStatusCallback: `${getSystemBaseUrl()}/api/call/recording-callback`
    });
  } catch (err) {
    console.error(`[Twilio] Failed to start recording for call ${callSid}:`, err.message);
  }
}

/**
 * searchAvailableNumbers
 * Queries Twilio API for available numbers matching countryCode and optional areaCode.
 */
async function searchAvailableNumbers(areaCode = "", countryCode = "US") {
  if (!client) throw new Error("Twilio client not initialized");
  const cCode = (countryCode || "US").toUpperCase();
  
  let list = [];
  try {
    const options = { limit: 10 };
    if (areaCode && cCode === "US") {
      options.areaCode = parseInt(areaCode) || undefined;
    }
    
    // 1. Try local numbers for specified country
    const localNumbers = await client.availablePhoneNumbers(cCode).local.list(options).catch(() => []);
    list = localNumbers;
    
    // 2. Fallback to toll-free numbers for country if local is empty
    if (!list || list.length === 0) {
      const tollFree = await client.availablePhoneNumbers(cCode).tollFree.list({ limit: 10 }).catch(() => []);
      list = tollFree;
    }
  } catch (err) {
    console.warn(`[TWILIO] Search error for country ${cCode}:`, err.message);
  }

  return list.map(n => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality || cCode,
    region: n.region || cCode,
    countryCode: cCode
  }));
}

/**
 * purchaseAndConfigureNumber
 * Buys a new phone number and configures its Twilio webhooks to point to Naxton AI.
 */
async function purchaseAndConfigureNumber(phoneNumber, businessId = null) {
  if (!client) throw new Error("Twilio client not initialized");

  const baseUrl = getSystemBaseUrl();
  const voiceWebhook = `${baseUrl}/api/call/incoming`;
  const smsWebhook = `${baseUrl}/api/call/incoming`;
  const statusWebhook = `${baseUrl}/api/call/status`;

  console.log(`[TWILIO] Purchasing number ${phoneNumber} with Webhook: ${voiceWebhook}`);

  // 1. Purchase & Configure Webhooks in Twilio
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: voiceWebhook,
    voiceMethod: 'POST',
    smsUrl: smsWebhook,
    smsMethod: 'POST',
    statusCallback: statusWebhook,
    statusCallbackMethod: 'POST'
  });

  // 2. Determine target tenantId
  let tenantId = null;
  if (businessId) {
    const biz = await prisma.business.findUnique({ where: { id: businessId } });
    if (biz) tenantId = biz.tenantId;
  }

  if (!tenantId) {
    const masterTenant = await prisma.tenant.findFirst({
      where: { name: { contains: "Platform Hub" } }
    });
    tenantId = masterTenant ? masterTenant.id : null;
  }

  if (!tenantId) {
    const firstT = await prisma.tenant.findFirst();
    tenantId = firstT ? firstT.id : "PLATFORM";
  }

  // 3. Register or update number in PostgreSQL DB safely without unique constraint errors
  let dbRecord = null;
  let numberRecord = await prisma.tenantPhoneNumber.findFirst({
    where: { twilioPhoneNumber: purchased.phoneNumber }
  });

  if (numberRecord) {
    if (businessId) {
      await prisma.tenantPhoneNumber.deleteMany({
        where: {
          businessId: businessId,
          id: { not: numberRecord.id }
        }
      });
    }
    dbRecord = await prisma.tenantPhoneNumber.update({
      where: { id: numberRecord.id },
      data: {
        twilioSid: purchased.sid,
        tenantId: tenantId,
        businessId: businessId || numberRecord.businessId,
        status: "ACTIVE",
        provider: "TWILIO"
      }
    });
  } else if (businessId) {
    let bizRecord = await prisma.tenantPhoneNumber.findFirst({
      where: { businessId: businessId }
    });

    if (bizRecord) {
      dbRecord = await prisma.tenantPhoneNumber.update({
        where: { id: bizRecord.id },
        data: {
          twilioPhoneNumber: purchased.phoneNumber,
          twilioSid: purchased.sid,
          tenantId: tenantId,
          status: "ACTIVE",
          provider: "TWILIO"
        }
      });
    } else {
      dbRecord = await prisma.tenantPhoneNumber.create({
        data: {
          twilioPhoneNumber: purchased.phoneNumber,
          twilioSid: purchased.sid,
          tenantId: tenantId,
          businessId: businessId,
          status: "ACTIVE",
          provider: "TWILIO"
        }
      });
    }
  } else {
    dbRecord = await prisma.tenantPhoneNumber.create({
      data: {
        twilioPhoneNumber: purchased.phoneNumber,
        twilioSid: purchased.sid,
        tenantId: tenantId,
        status: "UNASSIGNED",
        provider: "TWILIO"
      }
    });
  }

  console.log(`[TWILIO] Purchased & Registered ${purchased.phoneNumber} -> DB ID: ${dbRecord.id}`);
  return { purchased, dbRecord };
}

/**
 * linkExistingNumber
 * Links an already purchased or existing Twilio number to a business and configures its webhooks.
 */
async function linkExistingNumber(phoneNumber, businessId) {
  if (!phoneNumber || !businessId) throw new Error("Phone number and Business ID are required");

  const biz = await prisma.business.findUnique({ where: { id: businessId } });
  if (!biz) throw new Error("Business not found");

  const baseUrl = getSystemBaseUrl();
  const voiceWebhook = `${baseUrl}/api/call/incoming`;
  const smsWebhook = `${baseUrl}/api/call/incoming`;
  const statusWebhook = `${baseUrl}/api/call/status`;

  // 1. If Twilio client initialized, update webhooks on Twilio side
  if (client) {
    try {
      const incomingList = await client.incomingPhoneNumbers.list({ phoneNumber: phoneNumber, limit: 1 });
      if (incomingList && incomingList.length > 0) {
        const sid = incomingList[0].sid;
        await client.incomingPhoneNumbers(sid).update({
          voiceUrl: voiceWebhook,
          voiceMethod: 'POST',
          smsUrl: smsWebhook,
          smsMethod: 'POST',
          statusCallback: statusWebhook,
          statusCallbackMethod: 'POST'
        });
        console.log(`[TWILIO] Webhooks updated for existing number ${phoneNumber}`);
      }
    } catch (err) {
      console.warn(`[TWILIO_WARN] Could not update webhooks on Twilio for ${phoneNumber}:`, err.message);
    }
  }

  // 2. Safely register or update in DB without twilioPhoneNumber or businessId unique constraint errors
  let dbRecord = null;
  let numberRecord = await prisma.tenantPhoneNumber.findFirst({
    where: { twilioPhoneNumber: phoneNumber }
  });

  if (numberRecord) {
    // Delete any placeholder 'PENDING' record for this business to avoid businessId unique collision
    await prisma.tenantPhoneNumber.deleteMany({
      where: {
        businessId: biz.id,
        id: { not: numberRecord.id }
      }
    });

    dbRecord = await prisma.tenantPhoneNumber.update({
      where: { id: numberRecord.id },
      data: {
        businessId: biz.id,
        tenantId: biz.tenantId,
        status: "ACTIVE",
        provider: "TWILIO"
      }
    });
  } else {
    let bizRecord = await prisma.tenantPhoneNumber.findFirst({
      where: { businessId: biz.id }
    });

    if (bizRecord) {
      dbRecord = await prisma.tenantPhoneNumber.update({
        where: { id: bizRecord.id },
        data: {
          twilioPhoneNumber: phoneNumber,
          tenantId: biz.tenantId,
          status: "ACTIVE",
          provider: "TWILIO"
        }
      });
    } else {
      dbRecord = await prisma.tenantPhoneNumber.create({
        data: {
          twilioPhoneNumber: phoneNumber,
          businessId: biz.id,
          tenantId: biz.tenantId,
          status: "ACTIVE",
          provider: "TWILIO"
        }
      });
    }
  }

  return dbRecord;
}

/**
 * syncAllTwilioWebhooks
 * Automatically fetches ALL phone numbers in Twilio account, configures their Voice & Messaging Webhooks
 * to point to naxtontechnologies.com/api/call/incoming, and registers them in DB inventory.
 */
async function syncAllTwilioWebhooks() {
  if (!client) {
    console.warn("[TWILIO_SYNC] Cannot sync: Twilio client not initialized.");
    return { count: 0, numbers: [] };
  }

  const baseUrl = getSystemBaseUrl();
  const voiceWebhook = `${baseUrl}/api/call/incoming`;
  const smsWebhook = `${baseUrl}/api/call/incoming`;
  const statusWebhook = `${baseUrl}/api/call/status`;

  console.log(`[TWILIO_SYNC] Starting Auto-Sync of all Twilio Phone Numbers to: ${voiceWebhook}`);

  // Fetch all phone numbers in Twilio account
  const twilioNumbers = await client.incomingPhoneNumbers.list({ limit: 100 });
  const masterTenant = await prisma.tenant.findFirst({
    where: { name: { contains: "Platform Hub" } }
  });
  const fallbackTenantId = masterTenant ? masterTenant.id : (await prisma.tenant.findFirst())?.id;

  const syncedList = [];

  for (const num of twilioNumbers) {
    try {
      // 1. Check if webhooks need updating in Twilio
      if (num.voiceUrl !== voiceWebhook || num.smsUrl !== smsWebhook) {
        await client.incomingPhoneNumbers(num.sid).update({
          voiceUrl: voiceWebhook,
          voiceMethod: 'POST',
          smsUrl: smsWebhook,
          smsMethod: 'POST',
          statusCallback: statusWebhook,
          statusCallbackMethod: 'POST'
        });
        console.log(`[TWILIO_SYNC] Updated Webhook for ${num.phoneNumber} (${num.friendlyName})`);
      }

      // 2. Ensure record exists in PostgreSQL TenantPhoneNumber inventory
      const existingInDb = await prisma.tenantPhoneNumber.findFirst({
        where: { twilioPhoneNumber: num.phoneNumber }
      });

      if (!existingInDb) {
        await prisma.tenantPhoneNumber.create({
          data: {
            twilioPhoneNumber: num.phoneNumber,
            twilioSid: num.sid,
            tenantId: fallbackTenantId,
            status: "UNASSIGNED",
            provider: "TWILIO"
          }
        });
        console.log(`[TWILIO_SYNC] Added new number ${num.phoneNumber} to DB inventory as UNASSIGNED.`);
      }

      syncedList.push({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        sid: num.sid,
        status: existingInDb ? existingInDb.status : "UNASSIGNED"
      });
    } catch (err) {
      console.error(`[TWILIO_SYNC_ERR] Failed syncing ${num.phoneNumber}:`, err.message);
    }
  }

  console.log(`[TWILIO_SYNC] Auto-Sync complete. Total numbers configured & synced: ${syncedList.length}`);
  return { count: syncedList.length, numbers: syncedList };
}

/**
 * transferCall
 */
async function transferCall(callSid, toPhoneNumber) {
  if (!client) return;
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'Polly.Joanna-Neural' }, 'Please hold while I connect you to a representative.');
    twiml.dial(toPhoneNumber);
    
    await client.calls(callSid).update({ twiml: twiml.toString() });
    console.log(`[Twilio] Call ${callSid} transferred to ${toPhoneNumber}`);
  } catch (error) {
    console.error(`[Twilio] Transfer failed for ${callSid}:`, error.message);
  }
}

module.exports = {
  client,
  hangupCall,
  startRecording,
  searchAvailableNumbers,
  purchaseAndConfigureNumber,
  linkExistingNumber,
  syncAllTwilioWebhooks,
  transferCall,
  getSystemBaseUrl
};
