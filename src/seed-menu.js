const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  try {
    const biz = await prisma.business.findFirst({ where: { phoneNumber: { contains: '5097977710' } } });
    if (!biz) {
      console.log('Business with number 5097977710 not found.');
      return;
    }

    console.log(`Found Business: ${biz.name} (${biz.id})`);

    const tid = biz.tenantId;

    // Clean old data for this business (handling dependencies)
    await prisma.orderItem.deleteMany({ where: { tenantId: tid } });
    await prisma.order.deleteMany({ where: { businessId: biz.id } });
    await prisma.menuSize.deleteMany({ where: { tenantId: tid } });
    await prisma.menuAddon.deleteMany({ where: { tenantId: tid } });
    await prisma.menuItem.deleteMany({ where: { businessId: biz.id } });
    await prisma.menuCategory.deleteMany({ where: { businessId: biz.id } });

    // Create Categories
    const catBurgers = await prisma.menuCategory.create({ data: { name: 'Gourmet Burgers', businessId: biz.id, tenantId: tid } });
    const catSides = await prisma.menuCategory.create({ data: { name: 'Crispy Sides', businessId: biz.id, tenantId: tid } });
    const catDrinks = await prisma.menuCategory.create({ data: { name: 'Shakes & Sodas', businessId: biz.id, tenantId: tid } });

    // Add Detailed Items
    await prisma.menuItem.create({
      data: {
        name: 'Classic Cheeseburger',
        description: 'Prime wagyu beef patty, melted cheddar, house-made pickles, and signature sauce on a brioche bun.',
        price: 9.99,
        categoryId: catBurgers.id,
        businessId: biz.id,
        tenantId: tid,
        sizes: { create: [ { name: 'Single', price: 0, tenantId: tid }, { name: 'Double', price: 4.00, tenantId: tid } ] },
        addons: { create: [ { name: 'Extra Bacon', price: 2.00, tenantId: tid }, { name: 'Extra Cheese', price: 1.00, tenantId: tid } ] }
      }
    });

    await prisma.menuItem.create({
      data: {
        name: 'Jalapeño Spicy Burger',
        description: 'Flame-grilled patty with spicy pepper jack cheese, grilled jalapeños, and habanero aioli.',
        price: 11.49,
        categoryId: catBurgers.id,
        businessId: biz.id,
        tenantId: tid,
        addons: { create: [ { name: 'Avocado', price: 2.50, tenantId: tid } ] }
      }
    });

    await prisma.menuItem.create({
      data: {
        name: 'Belgian Fries',
        description: 'Thick-cut, double-fried potatoes served with roasted garlic mayo.',
        price: 4.49,
        categoryId: catSides.id,
        businessId: biz.id,
        tenantId: tid,
        sizes: { create: [ { name: 'Medium', price: 0, tenantId: tid }, { name: 'Large', price: 2.00, tenantId: tid } ] }
      }
    });

    await prisma.menuItem.create({
      data: {
        name: 'Hand-Spun Vanilla Shake',
        description: 'Made with premium vanilla bean ice cream and organic whole milk.',
        price: 6.99,
        categoryId: catDrinks.id,
        businessId: biz.id,
        tenantId: tid,
        addons: { create: [ { name: 'Oreo Crumb', price: 1.00, tenantId: tid } ] }
      }
    });

    await prisma.menuItem.create({
      data: {
        name: 'Fountain Soda',
        description: 'Cold and refreshing carbonated beverage.',
        price: 2.99,
        categoryId: catDrinks.id,
        businessId: biz.id,
        tenantId: tid,
        sizes: { create: [ { name: 'Medium', price: 0, tenantId: tid }, { name: 'Large', price: 1.00, tenantId: tid } ] }
      }
    });

    console.log('✅ Menu Architecture Completed: Full gourmet menu seeded.');
  } catch (err) {
    console.error('❌ Seeding Failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
