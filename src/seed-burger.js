const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  const businessId = '11af1858-dd05-44d2-952e-7048ccbb1a1e';
  const tenantId = '117925c8-50dc-42a8-9c64-a9190e62db1d';

  console.log('Updating phone number...');
  await prisma.business.update({
    where: { id: businessId },
    data: { phoneNumber: '+14782888237' }
  });

  console.log('Cleaning old menu...');
  // Using queryRaw to be safe if client is stale
  try { await prisma.$executeRawUnsafe(`DELETE FROM "MenuOption" WHERE "tenantId" = '${tenantId}'`); } catch(e) {}
  try { await prisma.$executeRawUnsafe(`DELETE FROM "MenuAddon" WHERE "tenantId" = '${tenantId}'`); } catch(e) {}
  try { await prisma.$executeRawUnsafe(`DELETE FROM "MenuSize" WHERE "tenantId" = '${tenantId}'`); } catch(e) {}
  try { await prisma.$executeRawUnsafe(`DELETE FROM "MenuItem" WHERE "tenantId" = '${tenantId}'`); } catch(e) {}
  try { await prisma.$executeRawUnsafe(`DELETE FROM "MenuCategory" WHERE "tenantId" = '${tenantId}'`); } catch(e) {}

  console.log('Creating categories...');
  try {
    const catBurgers = await prisma.menuCategory.create({
      data: { name: 'Burgers', businessId, tenantId, displayOrder: 1 }
    });
    const catSides = await prisma.menuCategory.create({
      data: { name: 'Sides', businessId, tenantId, displayOrder: 2 }
    });
    const catDrinks = await prisma.menuCategory.create({
      data: { name: 'Drinks', businessId, tenantId, displayOrder: 3 }
    });

    console.log('Creating items...');
    await prisma.menuItem.create({
      data: {
        name: 'Nexton Classic Burger', price: 9.99, description: 'Double beef patty, cheddar cheese, special sauce.',
        categoryId: catBurgers.id, businessId, tenantId,
        sizes: { create: [
          { name: 'Single', price: 0, tenantId },
          { name: 'Double', price: 3.00, tenantId }
        ]}
      }
    });

    await prisma.menuItem.create({
      data: {
        name: 'Spicy BBQ Burger', price: 11.99, description: 'Grilled beef patty with spicy BBQ sauce and jalapeños.',
        categoryId: catBurgers.id, businessId, tenantId,
        addons: { create: [
          { name: 'Extra Jalapeños', price: 0.50, tenantId },
          { name: 'Extra Bacon', price: 2.00, tenantId }
        ]}
      }
    });

    await prisma.menuItem.create({
      data: {
        name: 'Crispy Fries', price: 3.99, categoryId: catSides.id, businessId, tenantId,
        sizes: { create: [
          { name: 'Small', price: 0, tenantId },
          { name: 'Large', price: 2.00, tenantId }
        ]}
      }
    });

    await prisma.menuItem.create({
      data: { name: 'Coca Cola', price: 2.50, categoryId: catDrinks.id, businessId, tenantId }
    });

    console.log('Success!');
  } catch (err) {
    console.error('Seeding failed:', err);
  }
}

seed().then(() => process.exit(0));
