
const express = require("express");
const router = express.Router();
const controller = require("./billing.controller");
const authMiddleware = require("../../middleware/auth.middleware");

router.get("/status", authMiddleware, controller.getBillingStatus);
router.post("/request-mints", authMiddleware, controller.requestMints);

module.exports = router;
