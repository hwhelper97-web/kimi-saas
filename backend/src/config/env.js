require("dotenv").config();

const DEFAULT_JWT_SECRET = "change-me";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn("[env] JWT_SECRET is not set. Falling back to default secret.");
    return DEFAULT_JWT_SECRET;
  }
  return secret;
}

module.exports = {
  port: Number(process.env.PORT || 5000),
  jwtSecret: getJwtSecret(),
  getJwtSecret,
  twilio: {
    authToken: process.env.TWILIO_AUTH_TOKEN,
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
};
