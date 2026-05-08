const express = require("express");
const router = express.Router();
const controller = require("./integrations.controller");
const authMiddleware = require("../../../middleware/auth.middleware");
const { allowRoles } = require("../../../middleware/role.middleware");
const { ROLES } = require("../../../constants/roles");
const { tenantMiddleware } = require("../../../middleware/tenant.middleware");

router.get(
  "/status",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.getStatus
);

router.post(
  "/connect",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.connect
);

router.get(
  "/logs",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.getLogs
);

router.get(
  "/get-settings",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.getSettings
);

router.post(
  "/update-settings",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.updateSettings
);

router.post(
  "/disconnect",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.disconnect
);

module.exports = router;
