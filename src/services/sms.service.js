const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER || '+1234567890'; // User should update this in .env

const client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

module.exports.client = client;

/**
 * sendOrderSms
 * Sends a summary of the order to the customer.
 */
exports.sendOrderSms = async (to, businessName, items, total, currency = 'USD') => {
  if (!client) {
    console.warn("[SMS Service] Twilio not configured. Skipping SMS.");
    return;
  }

  try {
    const itemSummary = items.map(it => `• ${it.quantity}x ${it.name}`).join("\n");
    const body = `✅ ORDER CONFIRMED\n${businessName}\n\nSummary:\n${itemSummary}\n\nTotal: $${Number(total).toFixed(2)}\n\nThank you! We're preparing your order now.`;

    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: to
    });

    console.log(`[SMS Service] Sent order SMS to ${to}: ${message.sid}`);
    return message;
  } catch (error) {
    console.error("[SMS Service] Error sending SMS:", error);
    throw error;
  }
};

/**
 * sendFailureSms
 * Informs customer that their order/appointment was NOT created due to missing info.
 */
exports.sendFailureSms = async (to, businessName, reason) => {
  if (!client) return;

  try {
    const body = `⚠️ UNCOMPLETED REQUEST\n${businessName}\n\nHi! We noticed our call was disconnected. Unfortunately, we couldn't complete your request because: ${reason}.\n\nPlease call us back so we can finalize this for you! We're looking forward to helping you.`;

    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: to
    });

    console.log(`[SMS Service] Sent failure SMS to ${to}: ${message.sid}`);
    return message;
  } catch (error) {
    console.error("[SMS Service] Error sending failure SMS:", error);
  }
};
