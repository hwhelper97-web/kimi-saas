const router = require("express").Router();
const ctl = require("../controllers/voice.controller");

router.post("/inbound", ctl.inboundWebhook);
router.post("/gather", ctl.gatherWebhook);

module.exports = router;
