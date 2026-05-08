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

const upload = require("../../middleware/upload.middleware");

// Category Routes
router.get("/categories", controller.listCategories);
router.post("/category", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), upload.single("image"), controller.createCategory);
router.put("/category/:id", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), upload.single("image"), controller.updateCategory);
router.post("/categories/reorder", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), controller.reorderCategories);
router.delete("/category/:id", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), controller.deleteCategory);

// Item Routes
router.get("/items", controller.listItems);
router.post("/item", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), upload.single("image"), controller.createItem);
router.put("/item/:id", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), upload.single("image"), controller.updateItem);
router.post("/items/reorder", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), controller.reorderItems);
router.post("/items/bulk-update", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), controller.bulkUpdateItems);
router.post("/items/bulk-delete", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), controller.bulkDeleteItems);
router.delete("/item/:id", allowRoles(ROLES.OWNER, ROLES.SUPERADMIN), controller.deleteItem);

module.exports = router;