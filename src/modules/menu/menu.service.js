const prisma = require("../../config/prisma");

/* ===============================
   CREATE MENU ITEM
=============================== */

exports.createMenuItem = async (data, tenantId) => {

  // Find the business that belongs to this tenant
  const business = await prisma.business.findFirst({
    where: {
      tenantId: tenantId
    }
  });

  if (!business) {
    throw new Error("Business not found for this tenant");
  }

  return prisma.menuItem.create({
    data: {
      name: data.name,
      description: data.description || "",
      price: parseFloat(data.price),
      category: data.category || "General",
      businessId: business.id
    }
  });

};


/* ===============================
   GET MENU ITEMS
=============================== */

exports.getMenuItems = async (tenantId) => {

  // Find the tenant's business
  const business = await prisma.business.findFirst({
    where: {
      tenantId: tenantId
    }
  });

  if (!business) {
    return [];
  }

  return prisma.menuItem.findMany({
    where: {
      businessId: business.id
    },
    include: {
      sizes: true,
      addons: true
    },
    orderBy: {
      name: "asc"
    }
  });

};