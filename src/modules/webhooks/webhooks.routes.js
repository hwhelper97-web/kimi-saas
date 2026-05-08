const express = require('express');
const router = express.Router();
const controller = require('./webhooks.controller');

// ElevenLabs Agent Webhooks
router.use((req, res, next) => {
  console.log(`[ELEVENLABS_WEBHOOK] ${req.method} ${req.originalUrl}`);
  if (req.body) console.log(`[ELEVENLABS_WEBHOOK_BODY]`, JSON.stringify(req.body, null, 2));
  next();
});

router.post('/elevenlabs/check-availability', controller.checkAvailability);
router.post('/elevenlabs/book-appointment', controller.bookAppointment);
router.post('/elevenlabs/post-call', controller.postCallWebhook);

module.exports = router;
