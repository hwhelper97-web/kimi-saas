const express = require("express");
const router = express.Router();
const controller = require("./support-manager.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");

// Support Manager routes
router.use(authMiddleware);
router.use(allowRoles(ROLES.MANAGER, ROLES.SUPERADMIN));

// Dashboard View
router.get("/dashboard", controller.getDashboard);

// API Routes
router.get("/api/team-stats", controller.getTeamStats);
router.get("/api/escalations", controller.getEscalations);
router.get("/api/sla", controller.getSlaData);
router.get("/api/unassigned", controller.getUnassignedTickets);
router.get("/api/active-chats", controller.getActiveChats);
router.post("/api/resolve-escalation", controller.resolveEscalation);
router.post("/api/assign", controller.assignTicket);

module.exports = router;
