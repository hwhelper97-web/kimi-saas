const express = require("express");
const router = express.Router();
const devopsController = require("./devops.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");

// All devops routes require DEVELOPER or SUPERADMIN
router.use(authMiddleware);
router.use(allowRoles(ROLES.DEVELOPER, ROLES.SUPERADMIN));

router.get("/overview", devopsController.getOverview);
router.get("/incidents", devopsController.getIncidents);
router.post("/incidents", devopsController.createIncident);
router.get("/logs", devopsController.getLogs);
router.get("/metrics", devopsController.getMetrics);
router.get("/tasks", devopsController.getInternalTasks);

module.exports = router;
