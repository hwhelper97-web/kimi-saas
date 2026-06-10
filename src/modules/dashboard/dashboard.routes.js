const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");
const dashboardController = require("./dashboard.controller");
const dashboardService = require("./dashboard.service");
const prisma = require("../../config/prisma");
const { billingGuard } = require("../../middleware/billing.middleware");

// GET /api/dashboard/analytics
router.get(
  "/analytics",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
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

// Generic Section Loader
router.get(
  "/:section",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN, ROLES.DEVELOPER, ROLES.MANAGER, ROLES.PRODUCT, ROLES.AGENT),
  async (req, res) => {
    const { section } = req.params;
    const isPartial = req.query.partial === "true";
    
    // Mapping sections to views
    const viewMap = {
      "dashboard": "admin-dashboard-apex", // This handles the main layout
      "business": "business-settings",
      "integrations": "integrations-marketplace",
      "platform": "platform-hub", // I will create this
      "call": "ai-calls", // I will create this
      "phone": "phone-management",
      "menu": "menu-management", // I will create this
      "services": "services-management", // I will create this
      "orders": "orders-list", // I will create this
      "appointment": "appointments-calendar", // I will create this
      "support-center": "support-center",
      "tickets": "tickets-management",
      "billing": "billing",
      "create-ticket": "create-ticket",
      "dev-ops": "workspace-dev",
      "manager-kpi": "workspace-manager",
      "product-trends": "workspace-product",
      "agent-inbox": "workspace-agent"
    };

    const viewName = viewMap[section];
    if (!viewName) return res.status(404).send("Section not found");

    if (isPartial) {
      let business = null;
      const bId = req.query.businessId;
      
      if (bId) {
        business = await prisma.business.findUnique({ where: { id: bId } });
        // If SuperAdmin, we can override the tenantId context from the business found
        if (business && req.user.role === 'SUPERADMIN') {
          req.tenantId = business.tenantId;
        }
      }

      // Fallback: if no business found yet and we need one for "business" or "appointment" section
      if (["business", "appointment"].includes(section) && !business) {
        business = await prisma.business.findFirst({ where: { tenantId: req.tenantId } });
      }

      const data = await dashboardService.getAnalytics(req.tenantId, bId || null, req.user.role);

      return res.render(viewName, { 
        layout: false, 
        data, 
        business, 
        user: req.user 
      });
    }

    // Default: render main dashboard shell
    const data = await dashboardService.getAnalytics(req.tenantId);
    res.render("admin-dashboard-apex", { data, section });
  }
);

module.exports = router;
