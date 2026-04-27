const prisma = require("../../config/prisma");
const Fuse = require("fuse.js");

exports.createOrderFromAI = async (businessId, orderData) => {
  // 1. Load business + menu with sizes and addons
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      menuItems: {
        include: { sizes: true, addons: true },
      },
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  let total = 0;

  // 2. Create the Order record first (total updated at the end)
  const order = await prisma.order.create({
    data: {
      customerName: "Phone Customer",
      total: 0,
      tenantId: business.tenantId,
      businessId: business.id, // ✅ FIXED: was missing, caused DB constraint error
    },
  });

  // 3. Create OrderItems with fuzzy menu matching
  const fuse = new Fuse(business.menuItems, { keys: ["name"], threshold: 0.4 });

  for (const item of orderData.items) {
    const result = fuse.search(item.name);
    const menuItem = result.length > 0 ? result[0].item : null;

    if (!menuItem) {
      console.warn(`[Order] No menu match for "${item.name}" — skipping`);
      continue;
    }

    let itemPrice = menuItem.price || 0;

    // Size override
    if (item.size && menuItem.sizes.length > 0) {
      const size = menuItem.sizes.find(
        (s) => s.name.toLowerCase() === item.size.toLowerCase()
      );
      if (size) itemPrice = size.price;
    }

    // Addon additions
    if (Array.isArray(item.addons) && item.addons.length > 0) {
      for (const addonName of item.addons) {
        const addon = menuItem.addons.find(
          (a) => a.name.toLowerCase() === addonName.toLowerCase()
        );
        if (addon) itemPrice += addon.price;
      }
    }

    const quantity = item.quantity || 1;
    total += itemPrice * quantity;

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        menuItemId: menuItem.id,
        quantity,
        tenantId: business.tenantId,
        unitPrice: itemPrice,
        selectedSize: item.size || null,
        // selectedAddons is a comma-separated string per the schema
        selectedAddons: Array.isArray(item.addons) && item.addons.length > 0
          ? item.addons.join(", ")
          : null,
      },
    });
  }

  // 4. Update final total
  await prisma.order.update({
    where: { id: order.id },
    data: { total },
  });

  console.log(`[Order] AI order created: ${order.id} (total: ${total})`);
  return order;
};