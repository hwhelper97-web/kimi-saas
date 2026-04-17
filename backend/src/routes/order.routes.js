const router = require("express").Router();
const ctl = require("../controllers/order.controller");
const { authRequired } = require("../middleware/auth.middleware");
const { tenantRequired, typeRequired } = require("../middleware/tenant.middleware");
const { validate } = require("../middleware/validate.middleware");
const { menuSchema, menuItemSchema, orderSchema, updateOrderSchema } = require("../validators/order.validator");

router.use(authRequired, tenantRequired, typeRequired("ORDER"));
router.get("/menus", ctl.listMenus);
router.post("/menus", validate(menuSchema), ctl.createMenu);
router.post("/menus/items", validate(menuItemSchema), ctl.createMenuItem);
router.get("/orders", ctl.listOrders);
router.post("/orders", validate(orderSchema), ctl.createOrder);
router.patch("/orders/:orderId", validate(updateOrderSchema), ctl.updateOrder);

module.exports = router;
