const prisma = require("../../config/prisma");
const menuAliasService = require("../../services/menu-alias.service");

exports.suggestAliases = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Name required" });
    const suggestions = menuAliasService.generateAutoAliases(name);
    return res.json({ success: true, data: suggestions });
  } catch (err) {
    console.error("[MenuItem] suggestAliases error:", err);
    return res.status(500).json({ error: "Failed to suggest aliases" });
  }
};

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
        variants: true,
        modifierGroups: { include: { group: { include: { options: true } } } },
        itemAddons: { include: { addon: true } },
        availabilityRule: true,
        aliases: true,
        sizes: true, // Legacy
        addons: true, // Legacy
        optionGroups: { include: { options: true } } // Legacy
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
      categoryId, businessId, variants, modifierGroups, itemAddons,
      calories, allergens, spicyLevel, availabilityRule,
      isVeg, isVegan, isSpicy, isPopular, isNew, tags, displayOrder,
      pricingType, serviceDuration, aliases
    } = req.body;

    let finalImageUrl = imageUrl;
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    }

    if (!name || !businessId) return res.status(400).json({ error: "Name and businessId are required" });

    // 🛡️ Parse JSON strings if they came from FormData
    if (typeof variants === 'string') try { variants = JSON.parse(variants); } catch(e){}
    if (typeof modifierGroups === 'string') try { modifierGroups = JSON.parse(modifierGroups); } catch(e){}
    if (typeof itemAddons === 'string') try { itemAddons = JSON.parse(itemAddons); } catch(e){}
    if (typeof availabilityRule === 'string') try { availabilityRule = JSON.parse(availabilityRule); } catch(e){}
    if (typeof aliases === 'string') try { aliases = JSON.parse(aliases); } catch(e){}

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
        imageUrl: finalImageUrl,
        prepTime: parseInt(prepTime) || 15,
        isAvailable: isAvailable !== undefined ? !!isAvailable : true,
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
        pricingType: pricingType || "FIXED",
        serviceDuration: parseInt(serviceDuration) || null,
        calories: parseInt(calories) || null,
        allergens,
        spicyLevel: parseInt(spicyLevel) || 0,
        variants: variants && Array.isArray(variants) ? {
          create: variants.map(v => ({
            name: v.name,
            price: parseFloat(v.price) || 0,
            calories: parseInt(v.calories) || null,
            prepTime: parseInt(v.prepTime) || null,
            isDefault: !!v.isDefault,
            tenantId: targetTenantId
          }))
        } : undefined,
        modifierGroups: modifierGroups && Array.isArray(modifierGroups) ? {
          create: modifierGroups.map(mgId => ({
            modifierGroupId: mgId
          }))
        } : undefined,
        itemAddons: itemAddons && Array.isArray(itemAddons) ? {
          create: itemAddons.map(aId => ({
            addonId: aId
          }))
        } : undefined,
        availabilityRule: availabilityRule ? {
          create: {
            availableDays: JSON.stringify(availabilityRule.days || []),
            startTime: availabilityRule.start,
            endTime: availabilityRule.end,
            stockQuantity: parseInt(availabilityRule.stock) || null
          }
        } : undefined
      },
      include: { 
        variants: true, 
        modifierGroups: { include: { group: true } }, 
        itemAddons: { include: { addon: true } },
        availabilityRule: true,
        aliases: true 
      }
    });

    // 🤖 AI Alias Generation
    const finalAliases = (aliases && Array.isArray(aliases) && aliases.length > 0) 
      ? aliases 
      : menuAliasService.generateAutoAliases(name);
    
    await menuAliasService.saveAliases(item.id, targetTenantId, finalAliases);

    return res.status(201).json({ success: true, data: { ...item, aliases: finalAliases } });
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
      categoryId, businessId, variants, modifierGroups, itemAddons,
      calories, allergens, spicyLevel, availabilityRule,
      isVeg, isVegan, isSpicy, isPopular, isNew, tags, displayOrder, isActive,
      pricingType, serviceDuration, aliases
    } = req.body;

    let finalImageUrl = imageUrl;
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    }

    // 🛡️ Parse JSON strings if they came from FormData
    if (typeof variants === 'string') try { variants = JSON.parse(variants); } catch(e){}
    if (typeof modifierGroups === 'string') try { modifierGroups = JSON.parse(modifierGroups); } catch(e){}
    if (typeof itemAddons === 'string') try { itemAddons = JSON.parse(itemAddons); } catch(e){}
    if (typeof availabilityRule === 'string') try { availabilityRule = JSON.parse(availabilityRule); } catch(e){}
    if (typeof aliases === 'string') try { aliases = JSON.parse(aliases); } catch(e){}

    const isSuper = req.user.role === "SUPERADMIN";
    const existing = await prisma.menuItem.findFirst({
      where: { 
        id, 
        ...(isSuper ? {} : { tenantId: req.tenantId }) 
      }
    });
    if (!existing) return res.status(404).json({ error: "Item not found" });

    const updated = await prisma.menuItem.update({
      where: { id },
      data: {
        name, description,
        price: parseFloat(price) || 0,
        imageUrl: finalImageUrl,
        prepTime: parseInt(prepTime) || 15,
        isAvailable: isAvailable !== undefined ? !!isAvailable : true,
        isActive: isActive !== undefined ? !!isActive : true,
        categoryId,
        isVeg: !!isVeg,
        isVegan: !!isVegan,
        isSpicy: !!isSpicy,
        isPopular: !!isPopular,
        isNew: !!isNew,
        tags,
        displayOrder: parseInt(displayOrder) || 0,
        pricingType: pricingType || "FIXED",
        serviceDuration: parseInt(serviceDuration) || null,
        calories: parseInt(calories) || null,
        allergens,
        spicyLevel: parseInt(spicyLevel) || 0
      }
    });

    // 🚀 Sync Enterprise Relations
    if (variants && Array.isArray(variants)) {
      await prisma.menuVariant.deleteMany({ where: { menuItemId: id } });
      await prisma.menuVariant.createMany({
        data: variants.map(v => ({
          menuItemId: id,
          name: v.name,
          price: parseFloat(v.price) || 0,
          calories: parseInt(v.calories) || null,
          prepTime: parseInt(v.prepTime) || null,
          isDefault: !!v.isDefault,
          tenantId: req.tenantId
        }))
      });
    }

    if (modifierGroups && Array.isArray(modifierGroups)) {
      await prisma.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } });
      await prisma.menuItemModifierGroup.createMany({
        data: modifierGroups.map(mgId => ({ menuItemId: id, modifierGroupId: mgId }))
      });
    }

    if (itemAddons && Array.isArray(itemAddons)) {
      await prisma.menuItemAddon.deleteMany({ where: { menuItemId: id } });
      await prisma.menuItemAddon.createMany({
        data: itemAddons.map(aId => ({ menuItemId: id, addonId: aId }))
      });
    }

    if (availabilityRule) {
      await prisma.menuAvailability.upsert({
        where: { menuItemId: id },
        update: {
          availableDays: JSON.stringify(availabilityRule.days || []),
          startTime: availabilityRule.start,
          endTime: availabilityRule.end,
          stockQuantity: parseInt(availabilityRule.stock) || null
        },
        create: {
          menuItemId: id,
          availableDays: JSON.stringify(availabilityRule.days || []),
          startTime: availabilityRule.start,
          endTime: availabilityRule.end,
          stockQuantity: parseInt(availabilityRule.stock) || null
        }
      });
    }

    if (aliases && Array.isArray(aliases)) {
      await menuAliasService.saveAliases(id, req.tenantId, aliases);
    }

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