const express = require("express");
const router = express.Router();

const controller = require("./call.controller");

const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");

// ─── PUBLIC (Twilio webhooks — no auth) ──────────────────────────────────────
router.post("/incoming", controller.incoming);
router.post("/process", controller.process);
router.get("/voice", controller.streamVoice);

// ─── PROTECTED ────────────────────────────────────────────────────────────────
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

// ⚠️  Keep /:id LAST — it is a wildcard and will greedily match any segment
router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN),
  controller.getCallDetails
);

module.exports = router;
