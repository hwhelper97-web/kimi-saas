const prisma = require("../../config/prisma");

// Create or Update Article
exports.upsertArticle = async (req, res) => {
  const { id, title, content, categoryId, businessId } = req.body;
  const isSuperAdmin = req.user.role === "SUPERADMIN";
  const tenantId = isSuperAdmin && req.body.tenantId ? req.body.tenantId : req.tenantId;

  try {
    let article;
    if (id) {
      const existing = await prisma.knowledgeArticle.findFirst({
        where: { id, ...(isSuperAdmin ? {} : { tenantId }) }
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: "Article not found or access denied" });
      }
      article = await prisma.knowledgeArticle.update({
        where: { id: existing.id },
        data: { title, content, categoryId }
      });
    } else {
      article = await prisma.knowledgeArticle.create({
        data: { title, content, categoryId, businessId, tenantId }
      });
    }
    
    res.json({ success: true, data: article });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search articles
exports.searchArticles = async (req, res) => {
  const { query, businessId } = req.query;
  const isSuperAdmin = req.user && req.user.role === "SUPERADMIN";
  const tenantId = isSuperAdmin ? req.query.tenantId : req.tenantId;

  if (!isSuperAdmin && !tenantId) {
    return res.status(403).json({ success: false, message: "Tenant context required" });
  }

  try {
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(businessId ? { businessId } : {}),
        ...(query ? {
          OR: [
            { title: { contains: query } },
            { content: { contains: query } }
          ]
        } : {})
      },
      take: 20
    });
    res.json({ success: true, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// List Categories
exports.getCategories = async (req, res) => {
  const { businessId } = req.query;
  const isSuperAdmin = req.user && req.user.role === "SUPERADMIN";
  const tenantId = isSuperAdmin ? req.query.tenantId : req.tenantId;

  if (!isSuperAdmin && !tenantId) {
    return res.status(403).json({ success: false, message: "Tenant context required" });
  }

  try {
    const categories = await prisma.knowledgeCategory.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(businessId ? { businessId } : {})
      },
      include: { articles: true }
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
