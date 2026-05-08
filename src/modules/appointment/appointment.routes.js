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
  tenantMiddleware,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.create
);

// GET /api/appointment
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.list
);

// PUT /api/appointment/:id/status
router.put(
  "/:id/status",
  authMiddleware,
  tenantMiddleware,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.updateStatus
);

// DELETE /api/appointment/:id
router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.delete
);

module.exports = router;