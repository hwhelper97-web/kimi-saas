const prisma = require("../../config/prisma");

/**
 * renderMobileMenu
 * Fetches business data and renders a premium mobile-first menu.
 */
exports.renderMobileMenu = async (req, res) => {
  try {
    const { subdomain } = req.params;

    // Find business by subdomain (stripeId in our schema)
    const business = await prisma.business.findFirst({
      where: {
        tenant: {
          OR: [
            { slug: subdomain },
            { stripeId: subdomain }
          ]
        }
      },
      include: {
        menuCategories: {
          include: {
            items: true
          }
        }
      }
    });

    if (!business) {
      return res.status(404).send("Menu not found");
    }

    // Sort categories and items
    const categories = business.menuCategories.map(cat => ({
      ...cat,
      items: cat.items.sort((a, b) => a.price - b.price)
    }));

    res.render("public-menu", {
      business,
      categories,
      layout: false // Render without the admin layout
    });
  } catch (error) {
    console.error("[Public Menu] Error:", error);
    res.status(500).send("Something went wrong");
  }
};
