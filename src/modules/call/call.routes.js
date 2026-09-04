const express = require("express");
const router = express.Router();

const controller = require("./call.controller");

const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");

const { validateTwilioSignature } = require("../../middleware/twilio-webhook.middleware");

// ─── PUBLIC (Twilio webhooks — signature verified) ─────────────────────────
router.use((req, res, next) => {
  console.log(`[CALL_WEBHOOK] ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[CALL_WEBHOOK_BODY]`, JSON.stringify(req.body, null, 2));
  }
  next();
});

router.all("/incoming", validateTwilioSignature, controller.incoming);
router.post("/process", validateTwilioSignature, controller.process);
router.post("/status", validateTwilioSignature, controller.status);
router.post("/recording", validateTwilioSignature, controller.recordingCallback);
router.get("/proxy-recording/:id", controller.proxyRecording);
router.get("/voice", controller.streamVoice);

// ─── PROTECTED ────────────────────────────────────────────────────────────────
router.post(
  "/test-voice",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN),
  controller.testVoice
);

router.post(
  "/test-ai",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN),
  controller.testAI
);

router.get(
  "/history",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN),
  controller.getCallHistory
);

router.get(
  "/provision/search",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.searchNumbers
);

router.post(
  "/provision/purchase",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.purchaseNumber
);

router.post(
  "/provision/link",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.linkExistingNumber
);

// ⚠️  Keep /:id LAST — it is a wildcard and will greedily match any segment
router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN, ROLES.AGENT),
  controller.getCallDetails
);

router.post(
  "/:id/transfer",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN, ROLES.AGENT),
  controller.transfer
);

module.exports = router;
