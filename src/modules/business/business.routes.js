const express = require("express");
const router = express.Router();

const controller = require("./business.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");
const { billingGuard } = require("../../middleware/billing.middleware");

/* =========================================
   🏢 BUSINESS ROUTES
========================================= */

// Create business (ONLY SUPERADMIN)
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.SUPERADMIN),
  controller.create
);

// Get all businesses (existing)
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.list
);

// ✅ NEW ROUTE (VERY IMPORTANT)
router.get(
  "/all",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN, ROLES.DEVELOPER, ROLES.MANAGER, ROLES.PRODUCT, ROLES.AGENT),
  controller.getAllBusinesses
);

// Get current business
router.get(
  "/current",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN, ROLES.DEVELOPER, ROLES.MANAGER, ROLES.PRODUCT, ROLES.AGENT),
  controller.getCurrent
);

const upload = require("../../middleware/upload.middleware");

// Update current business
router.put(
  "/current",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  upload.single("logo"),
  controller.updateCurrent
);

// Update specific business by ID
router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  upload.single("logo"),
  controller.updateCurrent
);

// Delete business (ONLY SUPERADMIN, Secure)
router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.SUPERADMIN),
  controller.remove
);

// Live Debug Terminal
router.get(
  "/:id/terminal",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN, ROLES.DEVELOPER),
  controller.renderTerminal
);

module.exports = router;