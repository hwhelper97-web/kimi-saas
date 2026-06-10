const prisma = require("../../config/prisma");

/**
 * renderMobileMenu
 * Fetches business data and renders a premium mobile-first menu.
 */
exports.renderMobileMenu = async (req, res) => {
  try {
    const { subdomain } = req.params;

    // Find business and determine its type
    const business = await prisma.business.findFirst({
      where: {
        tenant: {
          OR: [
            { slug: subdomain },
            { stripeId: subdomain }
          ]
        }
      }
    });

    if (!business) {
      return res.status(404).send("Menu not found");
    }

    const type = business.type?.toLowerCase() || "";
    const isAppt = ["salon", "saloon", "spa", "barber", "clinic", "wellness", "massage", "studio", "dentist", "doctor", "specialist", "appointment"].some(k => type.includes(k));

    let categories = [];

    if (isAppt) {
      const data = await prisma.serviceCategory.findMany({
        where: { businessId: business.id },
        include: { services: true },
        orderBy: { sortOrder: "asc" }
      });
      categories = data.map(cat => ({
        ...cat,
        items: cat.services.map(s => ({
          ...s,
          price: s.price // Mapping for template consistency
        }))
      }));
    } else {
      const data = await prisma.menuCategory.findMany({
        where: { businessId: business.id },
        include: { items: true },
        orderBy: { sortOrder: "asc" }
      });
      categories = data.map(cat => ({
        ...cat,
        items: cat.items.sort((a, b) => a.price - b.price)
      }));
    }

    res.render("public-menu", {
      business,
      categories,
      isAppt,
      layout: false
    });
  } catch (error) {
    console.error("[Public Menu] Error:", error);
    res.status(500).send("Something went wrong");
  }
};
