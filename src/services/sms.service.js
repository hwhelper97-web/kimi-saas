const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER || '+1234567890'; // User should update this in .env

const client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

module.exports.client = client;

const { getCurrencySymbol } = require('../constants/currencies');

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
    const symbol = getCurrencySymbol(currency);
    const itemSummary = items.map(it => `• ${it.quantity}x ${it.name}`).join("\n");
    const body = `✅ ORDER CONFIRMED\n${businessName}\n\nSummary:\n${itemSummary}\n\nTotal: ${symbol}${Number(total).toFixed(2)}\n\nThank you! We're preparing your order now.`;

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

/**
 * sendAppointmentSms
 * Confirmation for new bookings.
 */
exports.sendAppointmentSms = async (to, businessName, service, time) => {
  if (!client) {
    console.warn("[SMS Service] Twilio not configured. Skipping SMS.");
    return;
  }
  try {
    const body = `📅 APPOINTMENT CONFIRMED\n${businessName}\n\nService: ${service}\nTime: ${time}\n\nWe look forward to seeing you! Thank you for choosing us.`;
    await client.messages.create({ body, from: fromNumber, to });
    console.log(`[SMS Service] Sent confirmation to ${to}`);
  } catch (err) { console.error("[SMS Service] Error:", err); }
};

/**
 * sendCancellationSms
 * Alert for cancelled bookings.
 */
exports.sendCancellationSms = async (to, businessName, service, time) => {
  if (!client) return;
  try {
    const body = `❌ APPOINTMENT CANCELLED\n${businessName}\n\nYour appointment for ${service} at ${time} has been cancelled.\n\nIf this was an error, please contact us or re-book online.`;
    await client.messages.create({ body, from: fromNumber, to });
    console.log(`[SMS Service] Sent cancellation to ${to}`);
  } catch (err) { console.error("[SMS Service] Error:", err); }
};

/**
 * sendOtpSms
 * Sends 6-digit OTP verification code for human transfer number verification.
 */
exports.sendOtpSms = async (to, otpCode, businessName = "Naxton AI Voice") => {
  if (!client) {
    console.warn(`[SMS Service] Twilio not configured. Simulated OTP for ${to}: ${otpCode}`);
    return { sid: "SIMULATED_OTP_" + Date.now(), simulated: true };
  }
  try {
    const body = `🔐 ${businessName} Verification Code\n\nYour verification code for human call transfers is: ${otpCode}\n\nThis code expires in 10 minutes. Do not share this code with anyone.`;
    const message = await client.messages.create({ body, from: fromNumber, to });
    console.log(`[SMS Service] Sent OTP SMS to ${to}: ${message.sid}`);
    return message;
  } catch (err) {
    console.error("[SMS Service] Error sending OTP SMS:", err);
    throw err;
  }
};
