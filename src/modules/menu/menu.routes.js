const express = require("express");
const router = express.Router();
const controller = require("./menu.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");

// All routes require auth and tenant context
router.use(authMiddleware);
router.use(tenantMiddleware);

// Category Routes
router.get("/categories", controller.listCategories);
router.post("/category", allowRoles(ROLES.OWNER), controller.createCategory);
router.put("/category/:id", allowRoles(ROLES.OWNER), controller.updateCategory);
router.post("/categories/reorder", allowRoles(ROLES.OWNER), controller.reorderCategories);
router.delete("/category/:id", allowRoles(ROLES.OWNER), controller.deleteCategory);

// Item Routes
router.get("/items", controller.listItems);
router.post("/item", allowRoles(ROLES.OWNER), controller.createItem);
router.put("/item/:id", allowRoles(ROLES.OWNER), controller.updateItem);
router.post("/items/reorder", allowRoles(ROLES.OWNER), controller.reorderItems);
router.post("/items/bulk-update", allowRoles(ROLES.OWNER), controller.bulkUpdateItems);
router.post("/items/bulk-delete", allowRoles(ROLES.OWNER), controller.bulkDeleteItems);
router.delete("/item/:id", allowRoles(ROLES.OWNER), controller.deleteItem);

module.exports = router;