const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middleware/auth.middleware");

// Sub-routers
const ticketRoutes = require("./ticket.routes");
const kbRoutes = require("./kb.routes");

// Apply authentication to all support routes
router.use(authMiddleware);

// Tickets Module
router.use("/tickets", ticketRoutes);

// Knowledge Base Module
router.use("/kb", kbRoutes);

// Conversation management (Legacy/Shared)
const supportController = require("./support.controller");
router.post("/conversations/start", supportController.startConversation);
router.get("/conversations", supportController.listConversations);
router.get("/conversations/:id/messages", supportController.getMessages);
router.post("/conversations/:id/messages", supportController.sendMessage);
router.put("/conversations/:id", supportController.updateConversation);

// Analytics
const analyticsController = require("./analytics.controller");
router.get("/intel/metrics", analyticsController.getTenantMetrics);

// AI Copilot
const aiController = require("./ai.controller");
router.get("/ai/suggest/:conversationId", aiController.getSuggestion);
router.get("/ai/analyze/:ticketId", aiController.analyzeTicket);

module.exports = router;
