const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");
const dashboardController = require("./dashboard.controller");
const dashboardService = require("./dashboard.service");

// GET /api/dashboard/analytics
router.get(
  "/analytics",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  dashboardController.getAnalytics
);

// GET /api/dashboard/top-items
router.get(
  "/top-items",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  dashboardController.getTopItems
);

// GET /api/dashboard/live-calls
router.get(
  "/live-calls",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  dashboardController.getLiveCalls
);

// GET /api/dashboard/admin  (renders EJS admin page)
router.get(
  "/admin",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const data = await dashboardService.getAnalytics(req.tenantId);
      return res.render("admin-dashboard-apex", { data });
    } catch (err) {
      console.error("[Dashboard] /admin render error:", err);
      return res.status(500).json({ error: "Failed to load admin dashboard" });
    }
  }
);

// GET /api/dashboard/business
router.get(
  "/business",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF),
  dashboardController.getBusinessDashboard
);

module.exports = router;
