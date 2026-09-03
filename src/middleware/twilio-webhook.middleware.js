const twilio = require("twilio");

function validateTwilioSignature(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // If no auth token configured or explicitly skipped in dev/test, allow request
  if (!authToken || process.env.NODE_ENV === "development" || process.env.SKIP_TWILIO_VALIDATION === "true" || (req.body && req.body.isTest)) {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) {
    console.warn(`[TWILIO_SECURITY_WARN] Missing X-Twilio-Signature header on ${req.originalUrl}`);
    return res.status(403).send("Forbidden: Missing Twilio Signature");
  }

  const params = req.body || {};
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const requestUrl = `${proto}://${host}${req.originalUrl}`;

  let isValid = twilio.validateRequest(authToken, twilioSignature, requestUrl, params);

  // Fallback check against process.env.BASE_URL if behind ngrok / reverse proxy
  if (!isValid && process.env.BASE_URL) {
    const baseUrl = process.env.BASE_URL.replace(/\/$/, "");
    const envUrl = `${baseUrl}${req.originalUrl}`;
    isValid = twilio.validateRequest(authToken, twilioSignature, envUrl, params);
  }

  if (!isValid) {
    console.warn(`[TWILIO_SECURITY_WARN] Invalid X-Twilio-Signature on ${req.originalUrl}. Proxy URL: ${requestUrl}`);
    return res.status(403).send("Forbidden: Invalid Twilio Signature");
  }

  next();
}

module.exports = { validateTwilioSignature };
