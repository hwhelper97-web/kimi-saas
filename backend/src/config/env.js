require("dotenv").config();

module.exports = {
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || "change-me",
  twilio: {
    authToken: process.env.TWILIO_AUTH_TOKEN,
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
};
