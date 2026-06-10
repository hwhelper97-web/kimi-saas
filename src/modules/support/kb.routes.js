const express = require("express");
const router = express.Router();
const controller = require("./kb.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { isSupportStaff } = require("../../middleware/role.middleware");

// Public views
router.get("/", controller.list);
router.get("/:slug", controller.getBySlug);

// Management (Support staff only)
router.post("/categories", authMiddleware, isSupportStaff, controller.createCategory);
router.post("/articles", authMiddleware, isSupportStaff, controller.createArticle);

module.exports = router;
