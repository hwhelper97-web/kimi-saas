const kbService = require("./kb.service");

exports.createCategory = async (req, res) => {
  try {
    const category = await kbService.createCategory(req.body, req.tenantId);
    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createArticle = async (req, res) => {
  try {
    const article = await kbService.createArticle(req.body, req.tenantId);
    return res.status(201).json({ success: true, data: article });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const { categoryId } = req.query;
    const articles = await kbService.listArticles(req.tenantId, categoryId);
    return res.json({ success: true, data: articles });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getBySlug = async (req, res) => {
  try {
    const article = await kbService.getArticleBySlug(req.tenantId, req.params.slug);
    if (!article) return res.status(404).json({ error: "Article not found" });
    return res.json({ success: true, data: article });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
