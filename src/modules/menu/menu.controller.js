const prisma = require("../../config/prisma");

/* ===============================
   CATEGORY CONTROLLERS
=============================== */

exports.listCategories = async (req, res) => {
  try {
    const { businessId } = req.query;
    const fs = require('fs');
    const logMsg = `[${new Date().toISOString()}] businessId: ${businessId} | tenantId: ${req.tenantId} | role: ${req.user?.role}\n`;
    fs.appendFileSync('debug_menu.log', logMsg);

    if (!businessId) return res.status(400).json({ error: "businessId is required" });

    const isSuper = req.user.role === "SUPERADMIN";
    const categories = await prisma.menuCategory.findMany({
      where: { 
        businessId, 
        ...(isSuper ? {} : { tenantId: req.tenantId }) 
      },
      include: {
        _count: {
          select: { items: true }
        }
      },
      orderBy: { displayOrder: "asc" }
    });

    console.log(`[MenuCategory] Listing for Business: ${businessId} | Tenant: ${req.tenantId} | Found: ${categories.length}`);
    return res.json({ success: true, data: categories });
  } catch (err) {
    console.error("[MenuCategory] list error:", err);
    return res.status(500).json({ error: "Failed to list categories" });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, imageUrl, displayOrder, businessId } = req.body;
    if (!name || !businessId) return res.status(400).json({ error: "Name and businessId are required" });

    let targetTenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN") {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) targetTenantId = biz.tenantId;
    }

    let finalImageUrl = imageUrl;
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    }

    const category = await prisma.menuCategory.create({
      data: {
        name,
        description,
        imageUrl: finalImageUrl,
        displayOrder: displayOrder || 0,
        businessId,
        tenantId: targetTenantId
      }
    });

    return res.status(201).json({ success: true, data: category });
  } catch (err) {
    console.error("[MenuCategory] create error:", err);
    return res.status(500).json({ error: "Failed to create category" });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    let { name, description, imageUrl, displayOrder, isActive } = req.body;

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const isSuper = req.user.role === "SUPERADMIN";
    const existing = await prisma.menuCategory.findFirst({
      where: { 
        id, 
        ...(isSuper ? {} : { tenantId: req.tenantId }) 
      }
    });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    const updated = await prisma.menuCategory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(displayOrder !== undefined && { displayOrder: parseInt(displayOrder) }),
        ...(isActive !== undefined && { isActive }),
      }
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("[MenuCategory] update error:", err);
    return res.status(500).json({ error: "Failed to update category" });
  }
};

exports.reorderCategories = async (req, res) => {
  try {
    const { orders } = req.body; // Array of {id, displayOrder}
    if (!orders || !Array.isArray(orders)) return res.status(400).json({ error: "Orders array required" });

    const isSuper = req.user.role === "SUPERADMIN";
    await Promise.all(orders.map(o => 
      prisma.menuCategory.updateMany({
        where: { 
          id: o.id, 
          ...(isSuper ? {} : { tenantId: req.tenantId }) 
        },
        data: { displayOrder: o.displayOrder }
      })
    ));

    return res.json({ success: true, message: "Categories reordered" });
  } catch (err) {
    console.error("[MenuCategory] reorder error:", err);
    return res.status(500).json({ error: "Failed to reorder categories" });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const isSuper = req.user.role === "SUPERADMIN";
    const existing = await prisma.menuCategory.findFirst({
      where: { 
        id, 
        ...(isSuper ? {} : { tenantId: req.tenantId }) 
      }
    });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    await prisma.menuCategory.delete({ where: { id } });
    return res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    console.error("[MenuCategory] delete error:", err);
    return res.status(500).json({ error: "Failed to delete category" });
  }
};

/* ===============================
   ITEM CONTROLLERS
=============================== */

exports.listItems = async (req, res) => {
  try {
    const { businessId, categoryId, search, availableOnly, priceMin, priceMax } = req.query;
    if (!businessId) return res.status(400).json({ error: "businessId is required" });

    const isSuper = req.user.role === "SUPERADMIN";
    const items = await prisma.menuItem.findMany({
      where: {
        businessId,
        ...(isSuper ? {} : { tenantId: req.tenantId }),
        ...(categoryId && { categoryId }),
        ...(availableOnly === "true" && { isAvailable: true }),
        ...(priceMin && { price: { gte: parseFloat(priceMin) } }),
        ...(priceMax && { price: { lte: parseFloat(priceMax) } }),
        ...(search && {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
            { tags: { contains: search } }
          ]
        })
      },
      include: {
        category: true,
        sizes: true,
        addons: true,
        optionGroups: {
          include: { options: true }
        }
      },
      orderBy: [
        { category: { displayOrder: "asc" } },
        { displayOrder: "asc" },
        { createdAt: "desc" }
      ]
    });

    console.log(`[MenuItem] Listing for Business: ${businessId} | Category: ${categoryId} | Tenant: ${req.tenantId} | Found: ${items.length}`);
    return res.json({ success: true, data: items });
  } catch (err) {
    console.error("[MenuItem] list error:", err);
    return res.status(500).json({ error: "Failed to list items" });
  }
};

exports.createItem = async (req, res) => {
  try {
    let {
      name, description, price, imageUrl, prepTime, isAvailable,
      categoryId, businessId, sizes, addons, optionGroups,
      isVeg, isVegan, isSpicy, isPopular, isNew, tags, displayOrder, availability,
      pricingType, serviceDuration
    } = req.body;

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    if (!name || !businessId) return res.status(400).json({ error: "Name and businessId are required" });

    let targetTenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN") {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) targetTenantId = biz.tenantId;
    }

    const item = await prisma.menuItem.create({
      data: {
        name,
        description,
        price: parseFloat(price) || 0,
        imageUrl,
        prepTime: parseInt(prepTime) || 15,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
        categoryId,
        businessId,
        tenantId: targetTenantId,
        isVeg: !!isVeg,
        isVegan: !!isVegan,
        isSpicy: !!isSpicy,
        isPopular: !!isPopular,
        isNew: !!isNew,
        tags,
        displayOrder: parseInt(displayOrder) || 0,
        availability: availability ? JSON.stringify(availability) : null,
        pricingType: pricingType || "FIXED",
        serviceDuration: parseInt(serviceDuration) || null,
        sizes: sizes && Array.isArray(sizes) ? {
          create: sizes.map(s => ({ name: s.name, price: parseFloat(s.price) || 0, tenantId: req.tenantId }))
        } : undefined,
        addons: addons && Array.isArray(addons) ? {
          create: addons.map(a => ({ name: a.name, price: parseFloat(a.price) || 0, tenantId: req.tenantId }))
        } : undefined,
        optionGroups: optionGroups && Array.isArray(optionGroups) ? {
          create: optionGroups.map(og => ({
            name: og.name,
            description: og.description,
            minSelect: parseInt(og.minSelect) || 0,
            maxSelect: parseInt(og.maxSelect) || 1,
            isRequired: !!og.isRequired,
            displayOrder: parseInt(og.displayOrder) || 0,
            tenantId: req.tenantId,
            options: {
              create: og.options.map(o => ({
                name: o.name,
                price: parseFloat(o.price) || 0,
                tenantId: req.tenantId
              }))
            }
          }))
        } : undefined
      },
      include: { sizes: true, addons: true, optionGroups: { include: { options: true } } }
    });

    return res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error("[MenuItem] create error:", err);
    return res.status(500).json({ error: "Failed to create item" });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      name, description, price, imageUrl, prepTime, isAvailable,
      categoryId, businessId, sizes, addons, optionGroups,
      isVeg, isVegan, isSpicy, isPopular, isNew, tags, displayOrder, isActive, availability,
      pricingType, serviceDuration
    } = req.body;

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const isSuper = req.user.role === "SUPERADMIN";
    const existing = await prisma.menuItem.findFirst({
      where: { 
        id, 
        ...(isSuper ? {} : { tenantId: req.tenantId }) 
      }
    });
    if (!existing) return res.status(404).json({ error: "Item not found" });

    // Handle relations cleanup
    if (sizes) await prisma.menuSize.deleteMany({ where: { menuItemId: id } });
    if (addons) await prisma.menuAddon.deleteMany({ where: { menuItemId: id } });
    if (optionGroups) {
      const groups = await prisma.menuOptionGroup.findMany({ where: { menuItemId: id } });
      for (const g of groups) {
        await prisma.menuOption.deleteMany({ where: { optionGroupId: g.id } });
      }
      await prisma.menuOptionGroup.deleteMany({ where: { menuItemId: id } });
    }

    const updated = await prisma.menuItem.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(prepTime !== undefined && { prepTime: parseInt(prepTime) }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(categoryId !== undefined && { categoryId }),
        ...(isVeg !== undefined && { isVeg: !!isVeg }),
        ...(isVegan !== undefined && { isVegan: !!isVegan }),
        ...(isSpicy !== undefined && { isSpicy: !!isSpicy }),
        ...(isPopular !== undefined && { isPopular: !!isPopular }),
        ...(isNew !== undefined && { isNew: !!isNew }),
        ...(tags !== undefined && { tags }),
        ...(displayOrder !== undefined && { displayOrder: parseInt(displayOrder) }),
        ...(availability !== undefined && { availability: availability ? JSON.stringify(availability) : null }),
        ...(pricingType !== undefined && { pricingType }),
        ...(serviceDuration !== undefined && { serviceDuration: parseInt(serviceDuration) }),
        sizes: sizes ? {
          create: sizes.map(s => ({ name: s.name, price: parseFloat(s.price) || 0, tenantId: req.tenantId }))
        } : undefined,
        addons: addons ? {
          create: addons.map(a => ({ name: a.name, price: parseFloat(a.price) || 0, tenantId: req.tenantId }))
        } : undefined,
        optionGroups: optionGroups ? {
          create: optionGroups.map(og => ({
            name: og.name,
            description: og.description,
            minSelect: parseInt(og.minSelect) || 0,
            maxSelect: parseInt(og.maxSelect) || 1,
            isRequired: !!og.isRequired,
            displayOrder: parseInt(og.displayOrder) || 0,
            tenantId: req.tenantId,
            options: {
              create: og.options.map(o => ({
                name: o.name,
                price: parseFloat(o.price) || 0,
                tenantId: req.tenantId
              }))
            }
          }))
        } : undefined
      },
      include: { sizes: true, addons: true, optionGroups: { include: { options: true } } }
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("[MenuItem] update error:", err);
    return res.status(500).json({ error: "Failed to update item" });
  }
};

exports.bulkUpdateItems = async (req, res) => {
  try {
    const { ids, updates } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: "IDs array required" });

    // Prepared data for update
    const data = {};
    if (updates.isAvailable !== undefined) data.isAvailable = updates.isAvailable;
    if (updates.categoryId !== undefined) data.categoryId = updates.categoryId;
    if (updates.priceAdjustment !== undefined) {
      // Handle price adjustment later or per item
    }

    if (updates.priceAdjustment !== undefined) {
      const adj = parseFloat(updates.priceAdjustment);
      await Promise.all(ids.map(async id => {
        const item = await prisma.menuItem.findUnique({ where: { id } });
        if (item) {
          await prisma.menuItem.update({
            where: { id },
            data: { price: item.price + adj, ...data }
          });
        }
      }));
    } else {
      await prisma.menuItem.updateMany({
        where: { id: { in: ids }, tenantId: req.tenantId },
        data
      });
    }

    return res.json({ success: true, message: "Items updated in bulk" });
  } catch (err) {
    console.error("[MenuItem] bulk update error:", err);
    return res.status(500).json({ error: "Failed bulk update" });
  }
};

exports.bulkDeleteItems = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: "IDs array required" });

    // Cleanup relations first (manual because of SQLite/Prisma restrictions sometimes or just to be safe)
    await prisma.menuSize.deleteMany({ where: { menuItemId: { in: ids } } });
    await prisma.menuAddon.deleteMany({ where: { menuItemId: { in: ids } } });
    const groups = await prisma.menuOptionGroup.findMany({ where: { menuItemId: { in: ids } } });
    const groupIds = groups.map(g => g.id);
    await prisma.menuOption.deleteMany({ where: { optionGroupId: { in: groupIds } } });
    await prisma.menuOptionGroup.deleteMany({ where: { menuItemId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { menuItemId: { in: ids } } });
    
    await prisma.menuItem.deleteMany({
      where: { id: { in: ids }, tenantId: req.tenantId }
    });

    return res.json({ success: true, message: "Items deleted in bulk" });
  } catch (err) {
    console.error("[MenuItem] bulk delete error:", err);
    return res.status(500).json({ error: "Failed bulk delete" });
  }
};

exports.reorderItems = async (req, res) => {
  try {
    const { orders } = req.body; // Array of {id, displayOrder}
    await Promise.all(orders.map(o => 
      prisma.menuItem.updateMany({
        where: { id: o.id, tenantId: req.tenantId },
        data: { displayOrder: o.displayOrder }
      })
    ));
    return res.json({ success: true, message: "Items reordered" });
  } catch (err) {
    console.error("[MenuItem] reorder error:", err);
    return res.status(500).json({ error: "Failed to reorder items" });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const isSuper = req.user.role === "SUPERADMIN";
    const existing = await prisma.menuItem.findFirst({
      where: { 
        id, 
        ...(isSuper ? {} : { tenantId: req.tenantId }) 
      }
    });
    if (!existing) return res.status(404).json({ error: "Item not found" });

    await prisma.menuSize.deleteMany({ where: { menuItemId: id } });
    await prisma.menuAddon.deleteMany({ where: { menuItemId: id } });
    const groups = await prisma.menuOptionGroup.findMany({ where: { menuItemId: id } });
    for (const g of groups) {
      await prisma.menuOption.deleteMany({ where: { optionGroupId: g.id } });
    }
    await prisma.menuOptionGroup.deleteMany({ where: { menuItemId: id } });
    await prisma.orderItem.deleteMany({ where: { menuItemId: id } });
    await prisma.menuItem.delete({ where: { id } });

    return res.json({ success: true, message: "Item deleted" });
  } catch (err) {
    console.error("[MenuItem] delete error:", err);
    return res.status(500).json({ error: "Failed to delete item" });
  }
};