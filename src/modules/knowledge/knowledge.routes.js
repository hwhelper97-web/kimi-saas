const express = require("express");
const router = express.Router();
const knowledgeController = require("./knowledge.controller");

router.post("/articles", knowledgeController.upsertArticle);
router.get("/articles/search", knowledgeController.searchArticles);
router.get("/categories", knowledgeController.getCategories);

module.exports = router;
