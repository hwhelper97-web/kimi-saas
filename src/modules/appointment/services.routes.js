const express = require("express");
const router = express.Router();
const servicesController = require("./services.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const upload = require("../../middleware/upload.middleware");

// All routes protected by tenant auth
router.use(authMiddleware);

// 📂 Categories
router.get("/categories", servicesController.listCategories);
router.post("/categories", upload.single("image"), servicesController.createCategory);
router.put("/categories/:id", upload.single("image"), servicesController.updateCategory);
router.delete("/categories/:id", servicesController.deleteCategory);

// ✂️ Services
router.get("/", servicesController.listServices);
router.post("/", upload.single("image"), servicesController.createService);
router.put("/:id", upload.single("image"), servicesController.updateService);
router.delete("/:id", servicesController.deleteService);

// 👥 Staff
router.get("/staff", servicesController.listStaff);
router.post("/staff", servicesController.createStaff);
router.put("/staff/:id", servicesController.updateStaff);
router.delete("/staff/:id", servicesController.deleteStaff);
router.post("/staff/assign", servicesController.assignStaffToService);

// 🗣️ AI Aliases
router.post("/alias", servicesController.addServiceAlias);

module.exports = router;
