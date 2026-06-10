const prisma = require("../../config/prisma");

class KBService {
  async createCategory(data, tenantId) {
    return prisma.knowledgeCategory.create({
      data: { ...data, tenantId }
    });
  }

  async createArticle(data, tenantId) {
    const slug = data.title.toLowerCase().replace(/ /g, "-").replace(/[^\w-]+/g, "");
    return prisma.knowledgeArticle.create({
      data: { ...data, tenantId, slug }
    });
  }

  async listArticles(tenantId, categoryId = null) {
    const where = { tenantId, isPublished: true };
    if (categoryId) where.categoryId = categoryId;
    
    return prisma.knowledgeArticle.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async getArticleBySlug(tenantId, slug) {
    const article = await prisma.knowledgeArticle.findFirst({
      where: { tenantId, slug, isPublished: true }
    });
    
    if (article) {
      await prisma.knowledgeArticle.update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } }
      });
    }
    
    return article;
  }
}

module.exports = new KBService();
