const express = require("express");
const router = express.Router();
const controller = require("./integrations.controller");
const authMiddleware = require("../../../middleware/auth.middleware");
const { allowRoles } = require("../../../middleware/role.middleware");
const { ROLES } = require("../../../constants/roles");
const { tenantMiddleware } = require("../../../middleware/tenant.middleware");
const { billingGuard, requireFeature } = require("../../../middleware/billing.middleware");

router.get(
  "/status",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  requireFeature("API_ACCESS"),
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.getStatus
);

router.post(
  "/connect",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  requireFeature("API_ACCESS"),
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.connect
);

router.get(
  "/logs",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  requireFeature("API_ACCESS"),
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.getLogs
);

router.get(
  "/get-settings",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  requireFeature("API_ACCESS"),
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.getSettings
);

router.post(
  "/update-settings",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  requireFeature("API_ACCESS"),
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.updateSettings
);

router.post(
  "/disconnect",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  requireFeature("API_ACCESS"),
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.disconnect
);

module.exports = router;
