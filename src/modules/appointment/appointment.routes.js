const express = require("express");
const router = express.Router();

const controller = require("./appointment.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");

// POST /api/appointment
router.post(
  "/",
  authMiddleware,
  tenantMiddleware, // ✅ FIXED: was missing — req.tenantId was undefined in controller
  allowRoles("OWNER", "STAFF"),
  controller.create
);

// GET /api/appointment
router.get(
  "/",
  authMiddleware,
  tenantMiddleware, // ✅ FIXED: was missing
  allowRoles("OWNER", "STAFF"),
  controller.list
);

module.exports = router;