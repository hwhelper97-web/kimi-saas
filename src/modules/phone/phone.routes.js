const express = require("express");
const router = express.Router();
const controller = require("./phone.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN));

router.get("/config", controller.getConfigs);
router.post("/config", controller.saveConfig);
router.put("/config/:id", controller.saveConfig);
router.post("/config/:id/toggle-ai", controller.toggleAI);
router.post("/request-transfer-verification", controller.requestTransferVerification);
router.post("/verify-transfer-otp", controller.verifyTransferOtp);
router.get("/analytics", controller.getAnalytics);

module.exports = router;
