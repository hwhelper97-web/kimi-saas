const express = require("express");
const router = express.Router();

const controller = require("./order.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");

/* ===============================
   CREATE ORDER (OWNER + STAFF)
=============================== */
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN),
  controller.create
);

/* ===============================
   GET ORDERS (OWNER + STAFF)
=============================== */
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN),
  controller.getOrders
);

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN),
  controller.getOrderById
);

module.exports = router;