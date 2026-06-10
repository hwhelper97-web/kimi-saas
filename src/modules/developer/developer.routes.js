const express = require("express");
const router = express.Router();
const controller = require("./developer.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");

// Developer-only routes
router.use(authMiddleware);
router.use(allowRoles(ROLES.DEVELOPER, ROLES.SUPERADMIN));

// Dashboard View
router.get("/dashboard", controller.getDashboard);

// API Routes for Dashboard Data
router.get("/api/analytics", controller.getAnalytics);
router.get("/api/tickets", controller.getTickets);
router.get("/api/incidents", controller.getIncidents);
router.post("/api/incidents", controller.createIncident);
router.patch("/api/incidents/:id", controller.updateIncident);
router.get("/api/logs", controller.getLogs);
router.get("/api/metrics", controller.getSystemMetrics);
router.get("/api/tasks", controller.getTasks);
router.get("/api/ai-metrics", controller.getAiMetrics);
router.get("/api/deployments", controller.getDeployments);
router.get("/api/queues", controller.getQueues);
router.get("/api/debug", controller.getDebugTools);
router.get("/api/notes", controller.getInternalNotes);
router.get("/api/ai-settings", controller.getAiSettings);
router.post("/api/ai-settings", controller.updateAiSettings);
router.post("/api/ai-test/preview", controller.testVoicePreview);
router.post("/api/ai-test/chat", controller.testAiChat);
router.get("/api/ai-test/token", controller.getAiSessionToken);

module.exports = router;
