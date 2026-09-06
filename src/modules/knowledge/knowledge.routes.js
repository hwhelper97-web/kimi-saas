const express = require("express");
const router = express.Router();
const knowledgeController = require("./knowledge.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");

// Administrative & search operations require authentication and tenant context
router.use(authMiddleware);
router.use(tenantMiddleware);

router.post("/articles", knowledgeController.upsertArticle);
router.delete("/articles/:id", knowledgeController.deleteArticle);
router.get("/articles/search", knowledgeController.searchArticles);
router.get("/categories", knowledgeController.getCategories);

module.exports = router;
