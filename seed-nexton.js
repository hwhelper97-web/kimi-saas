const prisma = require('./src/config/prisma');
const bcrypt = require('bcrypt');

async function seedComplete() {
  console.log("Wiping entire database...");
  
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.call.deleteMany();
  await prisma.menuOption.deleteMany();
  await prisma.menuOptionGroup.deleteMany();
  await prisma.menuAddon.deleteMany();
  await prisma.menuSize.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const hashedSuper = await bcrypt.hash('admin123', 10);
  const hashedOwner = await bcrypt.hash('password123', 10);
  const hashedStaff = await bcrypt.hash('staff123', 10);

  // SuperAdmin Tenant
  console.log("Creating Superadmin...");
  const superTenant = await prisma.tenant.create({ data: { name: 'Kimi Superadmin' } });
  await prisma.user.create({
    data: { email: 'superadmin@nexton.ai', password: hashedSuper, role: 'SUPERADMIN', tenantId: superTenant.id }
  });

  // 1. Nexton Burger Joint (Tenant + Business)
  const t1 = await prisma.tenant.create({ data: { name: 'Nexton Burger Joint Tenant' } });
  const b1 = await prisma.business.create({
    data: { name: 'Nexton Burger Joint', type: 'restaurant', phoneNumber: '+15550001111', address: '123 Burger Lane', timings: 'Mon-Sun 11AM-11PM', currency: 'USD', taxRate: 8.5, tenantId: t1.id }
  });
  await prisma.user.create({ data: { email: 'owner@burger.nexton.ai', password: hashedOwner, role: 'OWNER', tenantId: t1.id } });
  await prisma.user.create({ data: { email: 'chef@burger.nexton.ai', password: hashedStaff, role: 'HEAD_CHEF', tenantId: t1.id } });
  await prisma.menuItem.create({
    data: {
      name: 'Nexton Classic Burger', price: 9.99, imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80', businessId: b1.id, tenantId: t1.id,
      sizes: { create: [{ name: 'Single', price: 9.99, tenantId: t1.id }, { name: 'Double', price: 12.99, tenantId: t1.id }] }
    }
  });

  // 2. Nexton Coffee Shop
  const t2 = await prisma.tenant.create({ data: { name: 'Nexton Coffee Shop Tenant' } });
  const b2 = await prisma.business.create({
    data: { name: 'Nexton Coffee Shop', type: 'restaurant', phoneNumber: '+15550002222', address: '456 Coffee Ave', timings: 'Mon-Sat 6AM-8PM', currency: 'USD', taxRate: 6.0, tenantId: t2.id }
  });
  await prisma.user.create({ data: { email: 'owner@coffee.nexton.ai', password: hashedOwner, role: 'OWNER', tenantId: t2.id } });
  await prisma.user.create({ data: { email: 'barista@coffee.nexton.ai', password: hashedStaff, role: 'BARISTA', tenantId: t2.id } });
  await prisma.menuItem.create({
    data: {
      name: 'Caramel Macchiato', price: 5.50, imageUrl: 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?auto=format&fit=crop&w=400&q=80', businessId: b2.id, tenantId: t2.id,
      sizes: { create: [{ name: 'Small', price: 4.50, tenantId: t2.id }, { name: 'Large', price: 6.50, tenantId: t2.id }] }
    }
  });

  // 3. Nexton Hair Salon
  const t3 = await prisma.tenant.create({ data: { name: 'Nexton Hair Salon Tenant' } });
  const b3 = await prisma.business.create({
    data: { name: 'Nexton Hair Salon', type: 'appointment', phoneNumber: '+15550003333', address: '789 Style Blvd', timings: 'Tue-Sun 9AM-7PM', currency: 'USD', taxRate: 0.0, tenantId: t3.id }
  });
  await prisma.user.create({ data: { email: 'owner@salon.nexton.ai', password: hashedOwner, role: 'OWNER', tenantId: t3.id } });
  await prisma.user.create({ data: { email: 'stylist@salon.nexton.ai', password: hashedStaff, role: 'STYLIST', tenantId: t3.id } });
  await prisma.appointment.create({
    data: { customerName: 'Alice Smith', serviceName: 'Women Haircut', date: new Date(Date.now() + 86400000), businessId: b3.id, tenantId: t3.id }
  });

  // 4. Nexton Spa & Massage
  const t4 = await prisma.tenant.create({ data: { name: 'Nexton Spa & Massage Tenant' } });
  const b4 = await prisma.business.create({
    data: { name: 'Nexton Spa & Massage', type: 'appointment', phoneNumber: '+15550004444', address: '101 Relax St', timings: 'Mon-Sun 10AM-9PM', currency: 'USD', taxRate: 0.0, tenantId: t4.id }
  });
  await prisma.user.create({ data: { email: 'owner@spa.nexton.ai', password: hashedOwner, role: 'OWNER', tenantId: t4.id } });
  await prisma.user.create({ data: { email: 'therapist@spa.nexton.ai', password: hashedStaff, role: 'THERAPIST', tenantId: t4.id } });
  await prisma.appointment.create({
    data: { customerName: 'Bob Johnson', serviceName: 'Deep Tissue Massage', date: new Date(Date.now() + 172800000), businessId: b4.id, tenantId: t4.id }
  });

  console.log("Database seeded perfectly!");
}

seedComplete().catch(console.error).finally(() => process.exit(0));
