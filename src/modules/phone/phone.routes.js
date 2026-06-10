const express = require("express");
const router = express.Router();
const controller = require("./phone.controller");
const authMiddleware = require("../../middleware/auth.middleware");

router.get("/config", authMiddleware, controller.getConfigs);
router.post("/config", authMiddleware, controller.saveConfig);
router.put("/config/:id", authMiddleware, controller.saveConfig);
router.post("/config/:id/toggle-ai", authMiddleware, controller.toggleAI);
router.get("/analytics", authMiddleware, controller.getAnalytics);

module.exports = router;
