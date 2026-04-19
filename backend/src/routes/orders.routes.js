const { Router } = require("express");
const { createOrder, listOrders, updateOrderStatus } = require("../controllers/orders.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = Router();

router.post("/", createOrder);
router.get("/", requireAuth, listOrders);
router.patch("/:id/status", requireAuth, updateOrderStatus);

module.exports = router;
