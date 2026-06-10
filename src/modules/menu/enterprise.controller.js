const prisma = require("../../config/prisma");

/* ===============================
   MODIFIER GROUPS
=============================== */

exports.listModifierGroups = async (req, res) => {
  try {
    const { businessId } = req.query;
    if (!businessId) return res.status(400).json({ error: "businessId required" });

    const groups = await prisma.modifierGroup.findMany({
      where: { 
        businessId,
        tenantId: req.tenantId
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ success: true, data: groups });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list modifier groups" });
  }
};

exports.createModifierGroup = async (req, res) => {
  try {
    let targetTenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN") {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) targetTenantId = biz.tenantId;
    }

    const group = await prisma.modifierGroup.create({
      data: {
        businessId,
        tenantId: targetTenantId,
        name,
        description,
        selectionType: selectionType || "SINGLE",
        minSelection: minSelection || 0,
        maxSelection: maxSelection || 1,
        isRequired: !!isRequired,
        options: {
          create: (options || []).map((opt, idx) => ({
            name: opt.name,
            price: parseFloat(opt.price) || 0,
            sortOrder: idx,
            isAvailable: true
          }))
        }
      },
      include: { options: true }
    });

    return res.status(201).json({ success: true, data: group });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create modifier group" });
  }
};

exports.updateModifierGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, selectionType, minSelection, maxSelection, isRequired, options } = req.body;

    // Transaction to update group and sync options
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update Group
      const group = await tx.modifierGroup.update({
        where: { id },
        data: {
          name,
          description,
          selectionType,
          minSelection,
          maxSelection,
          isRequired: !!isRequired
        }
      });

      // 2. Handle Options
      if (options && Array.isArray(options)) {
        // Delete removed
        const optIds = options.filter(o => o.id).map(o => o.id);
        await tx.modifierOption.deleteMany({
          where: { modifierGroupId: id, NOT: { id: { in: optIds } } }
        });

        // Update/Create
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          if (opt.id) {
            await tx.modifierOption.update({
              where: { id: opt.id },
              data: { name: opt.name, price: parseFloat(opt.price) || 0, sortOrder: i }
            });
          } else {
            await tx.modifierOption.create({
              data: { modifierGroupId: id, name: opt.name, price: parseFloat(opt.price) || 0, sortOrder: i }
            });
          }
        }
      }
      return tx.modifierGroup.findUnique({ where: { id }, include: { options: true } });
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update modifier group" });
  }
};

exports.deleteModifierGroup = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.modifierGroup.delete({ where: { id } });
    return res.json({ success: true, message: "Modifier group deleted" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete" });
  }
};

/* ===============================
   ADDONS (BUSINESS-WIDE)
=============================== */

exports.listAddons = async (req, res) => {
  try {
    const { businessId } = req.query;
    const addons = await prisma.menuAddon.findMany({
      where: { businessId, tenantId: req.tenantId },
      orderBy: { name: 'asc' }
    });
    return res.json({ success: true, data: addons });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list addons" });
  }
};

exports.createAddon = async (req, res) => {
  try {
    let targetTenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN") {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) targetTenantId = biz.tenantId;
    }

    const addon = await prisma.menuAddon.create({
      data: {
        businessId,
        tenantId: targetTenantId,
        name,
        description,
        price: parseFloat(price) || 0,
        isAvailable: true
      }
    });
    return res.status(201).json({ success: true, data: addon });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create addon" });
  }
};

exports.updateAddon = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, isAvailable } = req.body;
    const updated = await prisma.menuAddon.update({
      where: { id },
      data: { name, description, price: parseFloat(price) || 0, isAvailable }
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update addon" });
  }
};

/* ===============================
   COMBO MEALS
=============================== */

exports.listCombos = async (req, res) => {
  try {
    const { businessId } = req.query;
    const combos = await prisma.comboMeal.findMany({
      where: { businessId, tenantId: req.tenantId },
      include: { items: { include: { menuItem: true } } }
    });
    return res.json({ success: true, data: combos });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list combos" });
  }
};

exports.createCombo = async (req, res) => {
  try {
    let targetTenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN") {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) targetTenantId = biz.tenantId;
    }

    const combo = await prisma.comboMeal.create({
      data: {
        businessId,
        tenantId: targetTenantId,
        name,
        description,
        comboPrice: parseFloat(comboPrice) || 0,
        items: {
          create: (items || []).map(it => ({
            menuItemId: it.menuItemId,
            quantity: parseInt(it.quantity) || 1
          }))
        }
      },
      include: { items: true }
    });
    return res.status(201).json({ success: true, data: combo });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create combo" });
  }
};

/* ===============================
   VARIANTS & AVAILABILITY
=============================== */

exports.updateItemAvailability = async (req, res) => {
  try {
    const { id } = req.params; // menuItemId
    const { availableDays, startTime, endTime, stockQuantity, isAvailable } = req.body;

    const updated = await prisma.menuAvailability.upsert({
      where: { menuItemId: id },
      update: {
        availableDays: JSON.stringify(availableDays || []),
        startTime,
        endTime,
        stockQuantity: parseInt(stockQuantity) || null,
        isAvailable: !!isAvailable
      },
      create: {
        menuItemId: id,
        availableDays: JSON.stringify(availableDays || []),
        startTime,
        endTime,
        stockQuantity: parseInt(stockQuantity) || null,
        isAvailable: !!isAvailable
      }
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update availability" });
  }
};
