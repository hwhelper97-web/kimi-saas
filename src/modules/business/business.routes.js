const express = require("express");
const router = express.Router();

const controller = require("./business.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");

/* =========================================
   🏢 BUSINESS ROUTES
========================================= */

// Create business (ONLY SUPERADMIN)
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.create
);

// Get all businesses (existing)
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.list
);

// ✅ NEW ROUTE (VERY IMPORTANT)
router.get(
  "/all",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.getAllBusinesses
);

// Get current business
router.get(
  "/current",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.getCurrent
);

const upload = require("../../middleware/upload.middleware");

// Update current business
router.put(
  "/current",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  upload.single("logo"),
  controller.updateCurrent
);

// Delete business (ONLY SUPERADMIN)
router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.remove
);

module.exports = router;