const express = require("express");
const router = express.Router();
const controller = require("./ticket.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { isSupportStaff } = require("../../middleware/role.middleware");

// Apply authentication to all ticket routes
router.use(authMiddleware);

// Public Support Routes (Any authenticated tenant user)
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.post("/:id/messages", controller.addMessage);

// Staff-Only Support Routes
router.patch("/:id", isSupportStaff, controller.update);
router.post("/:id/assign", isSupportStaff, controller.assign);
router.post("/:id/escalate", isSupportStaff, controller.escalate);

module.exports = router;
