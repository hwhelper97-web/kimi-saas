const prisma = require("../../config/prisma");

// Create or Update Article
exports.upsertArticle = async (req, res) => {
  const { id, title, content, categoryId, businessId, tenantId } = req.body;
  try {
    const article = id 
      ? await prisma.knowledgeArticle.update({ where: { id }, data: { title, content, categoryId } })
      : await prisma.knowledgeArticle.create({ data: { title, content, categoryId, businessId, tenantId } });
    
    res.json({ success: true, data: article });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search articles (Simple RAG simulation)
exports.searchArticles = async (req, res) => {
  const { query, businessId, tenantId } = req.query;
  try {
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        tenantId,
        businessId,
        OR: [
          { title: { contains: query } },
          { content: { contains: query } }
        ]
      },
      take: 5
    });
    res.json({ success: true, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// List Categories
exports.getCategories = async (req, res) => {
  const { businessId, tenantId } = req.query;
  try {
    const categories = await prisma.knowledgeCategory.findMany({
      where: { tenantId, businessId },
      include: { articles: true }
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
