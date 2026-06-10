const express = require('express');
const router = express.Router();
const controller = require('./webhooks.controller');

// ElevenLabs Agent Webhooks
router.use((req, res, next) => {
  console.log(`[ELEVENLABS_WEBHOOK] ${req.method} ${req.originalUrl}`);
  console.log(`[ELEVENLABS_WEBHOOK_HEADERS]`, JSON.stringify(req.headers, null, 2));
  if (req.body) console.log(`[ELEVENLABS_WEBHOOK_BODY]`, JSON.stringify(req.body, null, 2));
  
  const oldSend = res.send;
  res.send = function(data) {
    console.log(`[ELEVENLABS_WEBHOOK_RESPONSE]`, data);
    return oldSend.apply(res, arguments);
  };
  next();
});

router.get('/elevenlabs/check-availability', controller.checkAvailability);
router.post('/elevenlabs/check-availability', controller.checkAvailability);
router.post('/elevenlabs/check_salon_availability', controller.checkAvailability);
router.post('/elevenlabs/get_salon_services', controller.checkAvailability); // Reusing checkAvailability for menu
router.post('/elevenlabs/book-appointment', controller.bookAppointment);
router.post('/elevenlabs/book_salon_appointment', controller.bookAppointment);
router.post('/elevenlabs/create-order', controller.createOrder);
router.post('/elevenlabs/create_order', controller.createOrder);
router.post('/elevenlabs/post-call', controller.postCallWebhook);

module.exports = router;
