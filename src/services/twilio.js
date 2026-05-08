const twilio = require('twilio');
const prisma = require('../config/prisma');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

/**
 * hangupCall
 * Terminates an active call.
 */
async function hangupCall(callSid) {
  if (!client) return;
  try {
    await client.calls(callSid).update({ status: 'completed' });
    console.log(`[Twilio] Successfully hung up call: ${callSid}`);
  } catch (error) {
    console.error(`[Twilio] Failed to hang up call ${callSid}:`, error.message);
  }
}

/**
 * startRecording
 * Starts recording an active call.
 */
async function startRecording(callSid) {
  if (!client) return;
  try {
    const baseUrl = process.env.BASE_URL || "https://nexton.ai";
    const recording = await client.calls(callSid).recordings.create({
      recordingStatusCallback: `${baseUrl}/api/call/recording`
    });
    console.log(`[Twilio] Started recording for call ${callSid}: ${recording.sid}`);
    return recording;
  } catch (error) {
    console.error(`[Twilio] Failed to start recording for ${callSid}:`, error.message);
  }
}

/**
 * searchAvailableNumbers
 * Finds numbers for purchase in a specific country/area.
 */
async function searchAvailableNumbers(areaCode = '212', countryCode = 'US') {
  if (!client) throw new Error("Twilio client not initialized");
  const numbers = await client.availablePhoneNumbers(countryCode).local.list({ areaCode, limit: 10 });
  return numbers.map(n => ({ phoneNumber: n.phoneNumber, friendlyName: n.friendlyName }));
}

/**
 * purchaseAndConfigureNumber
 * Buys a number and sets its voice webhook.
 */
async function purchaseAndConfigureNumber(phoneNumber, businessId) {
  if (!client) throw new Error("Twilio client not initialized");
  
  const baseUrl = process.env.BASE_URL || "https://nexton.ai";
  
  // 1. Purchase
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: `${baseUrl}/api/call/voice`,
    voiceMethod: 'POST',
    statusCallback: `${baseUrl}/api/call/status`,
    statusCallbackMethod: 'POST'
  });

  // 2. Assign to Business in DB
  await prisma.business.update({
    where: { id: businessId },
    data: { phoneNumber: purchased.phoneNumber }
  });

  return purchased;
}

module.exports = { client, hangupCall, startRecording, searchAvailableNumbers, purchaseAndConfigureNumber };
