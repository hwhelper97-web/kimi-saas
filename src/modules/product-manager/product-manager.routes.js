const express = require("express");
const router = express.Router();
const controller = require("./product-manager.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");

// Product Manager routes
router.use(authMiddleware);
router.use(allowRoles(ROLES.PRODUCT, ROLES.SUPERADMIN));

// Dashboard View
router.get("/dashboard", controller.getDashboard);

// API Routes
router.get("/api/analytics", controller.getAnalytics);
router.get("/api/feature-requests", controller.getFeatureRequests);
router.get("/api/roadmap", controller.getRoadmap);
router.get("/api/tenant-insights", controller.getTenantInsights);

module.exports = router;
