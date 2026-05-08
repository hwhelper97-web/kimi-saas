const express = require("express");
const router = express.Router();
const supportController = require("./support.controller");
const authMiddleware = require("../../middleware/auth.middleware");

router.use(authMiddleware);

router.post("/conversations/resolve-active", supportController.resolveActiveConversation);
router.get("/conversations", supportController.listConversations);
router.get("/conversations/:id/messages", supportController.getMessages);
router.post("/conversations/:id/toggle-ai", supportController.toggleAI);
router.post("/conversations/start", supportController.startConversation);
router.post("/conversations/:id/messages", supportController.sendMessage);
router.post("/conversations/:id/resolve", supportController.resolveConversation);

router.get("/tickets", supportController.listTickets);
router.post("/tickets", supportController.createTicket);
router.post("/tickets/:id/status", supportController.updateTicketStatus);
router.post("/messages/send-tenant", supportController.sendTenantMessage);

module.exports = router;
