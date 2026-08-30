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

const settingsController = require("./settings.controller");

// Platform Settings (Extended)
router.get(
  "/settings",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  settingsController.getAllSettings
);

router.get(
  "/settings/:group",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  settingsController.getSettingsByGroup
);

router.post(
  "/settings",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  settingsController.updateSettings
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

// Update Tenant Plan/Trial
router.put(
  "/tenants/:tenantId/plan",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.updateTenantPlan
);

// --- NEW SYSTEM MONITORING ROUTES ---

router.get(
  "/infrastructure",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getInfrastructureStats
);

router.get(
  "/ai-ops",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getAiOperations
);

router.get(
  "/audit-logs",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getAuditLogs
);

router.get(
  "/incidents",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getIncidents
);

router.post(
  "/incidents",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.createIncident
);

router.get(
  "/queues",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getQueueStats
);

// --- TELEPHONY INVENTORY ---
router.get(
  "/inventory/phones",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getPhoneInventory
);

router.post(
  "/inventory/phones/assign",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.assignPhoneToTenant
);

router.post(
  "/inventory/phones/provision",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.provisionPlatformNumber
);

// --- DEMO CENTER ADMIN ---
router.get(
  "/demos",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.getAdminDemoMetrics
);

router.post(
  "/demos/:token/extend",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.extendAdminDemo
);

router.post(
  "/demos/:token/deactivate",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.deactivateAdminDemo
);

router.post(
  "/demos/:token/release-phone",
  authMiddleware,
  allowRoles(ROLES.SUPERADMIN),
  controller.releaseAdminDemoPhone
);

module.exports = router;