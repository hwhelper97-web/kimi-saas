const express = require("express");
const router = express.Router();

const controller = require("./superadmin.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");

/* =========================================
   🧑‍💼 SUPERADMIN ROUTES
========================================= */

// Get all tenants
router.get(
  "/tenants",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getTenants
);

// Create new tenant
router.post(
  "/tenants",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.createTenant
);

// Delete tenant (Secure)
router.delete(
  "/tenants/:tenantId",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.deleteTenant
);

// Get all businesses (no tenantMiddleware needed — superadmin scope)
router.get(
  "/businesses",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getAllBusinesses
);

// Analytics overview
router.get(
  "/analytics",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getAnalytics
);

// Recent calls
router.get(
  "/calls",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getRecentCalls
);

// Call transcripts
router.get(
  "/transcripts",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getCallTranscripts
);

// Activity feed
router.get(
  "/activity",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getActivityFeed
);

// Call details
router.get(
  "/call/:id",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getCallDetails
);

// Revenue stats
router.get(
  "/revenue",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getRevenueStats
);

// Restaurant performance
router.get(
  "/restaurant-performance",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getRestaurantPerformance
);

// Sales leaderboard
router.get(
  "/leaderboard",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getSalesLeaderboard
);

const upload = require("../../middleware/upload.middleware");

// Update Project Logo
router.post(
  "/upload-logo",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  upload.single("logo"),
  controller.uploadLogo
);

// Get Platform Settings
router.get(
  "/settings",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getSettings
);

// Update Platform Settings
router.post(
  "/settings",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.updateSettings
);

// Get Mint Requests
router.get(
  "/mint-requests",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getMintRequests
);

// Update Mint Request Status
router.post(
  "/mint-requests/:requestId",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.updateMintRequest
);

// Manually Add Tokens to Tenant
router.post(
  "/tenants/:tenantId/tokens",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.addTokensManually
);

// Toggle Demo Account
router.post(
  "/tenants/:tenantId/toggle-demo",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.toggleDemoAccount
);

module.exports = router;