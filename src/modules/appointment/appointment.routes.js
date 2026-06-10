const express = require("express");
const router = express.Router();

const controller = require("./appointment.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");
const { billingGuard } = require("../../middleware/billing.middleware");

// POST /api/appointment
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.create
);

// GET /api/appointment/slots
router.get(
  "/slots",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.getSlots
);

// GET /api/appointment
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.list
);

// GET /api/appointment/:id
router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.getById
);

// PUT /api/appointment/:id/status
router.put(
  "/:id/status",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.updateStatus
);

// DELETE /api/appointment/:id
router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  billingGuard,
  allowRoles("OWNER", "STAFF", "SUPERADMIN"),
  controller.delete
);

module.exports = router;