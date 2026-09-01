const twilio = require("twilio");

function validateTwilioSignature(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // If no auth token configured or explicitly skipped in local dev, allow request
  if (!authToken || process.env.NODE_ENV === "development" || process.env.SKIP_TWILIO_VALIDATION === "true") {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) {
    console.warn(`[TWILIO_SECURITY_WARN] Missing X-Twilio-Signature header on ${req.originalUrl}`);
    return res.status(403).send("Forbidden: Missing Twilio Signature");
  }

  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const params = req.body || {};

  const isValid = twilio.validateRequest(authToken, twilioSignature, url, params);
  if (!isValid) {
    console.warn(`[TWILIO_SECURITY_WARN] Invalid X-Twilio-Signature on ${req.originalUrl}`);
    return res.status(403).send("Forbidden: Invalid Twilio Signature");
  }

  next();
}

module.exports = { validateTwilioSignature };
