const express = require("express");
const router = express.Router();
const controller = require("./support-agent.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");

// Support Agent Level 1 routes
router.use(authMiddleware);
router.use(allowRoles(ROLES.AGENT, ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.MANAGER));

// Dashboard View
router.get("/dashboard", controller.getDashboard);

// API Routes
router.get("/api/tickets", controller.getTickets);
router.get("/api/conversations", controller.getConversations);
router.post("/api/tickets/:id/escalate", controller.escalateTicket);
router.get("/api/knowledge", controller.getKnowledgeBase);
router.delete("/api/articles/:id", controller.deleteArticle);
router.get("/api/customers", controller.getCustomers);

module.exports = router;
