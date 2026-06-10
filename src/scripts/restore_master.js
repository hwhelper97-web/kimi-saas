const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function restoreMasterData() {
  console.log('🚀 RESTORING MASTER PLATFORM DATA...');

  try {
    // 1. Update Platform JSON Config
    const configPath = path.join(__dirname, '../config/platform.json');
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    const platformConfig = {
      projectName: 'Naxton AI',
      logoUrl: '/syed_master_logo.png'
    };
    fs.writeFileSync(configPath, JSON.stringify(platformConfig, null, 2));
    console.log('✅ Platform Config Restored (Naxton AI)');

    // 2. Create the Master Tenant
    const subdomain = 'newyorkpizzapastamenu.com';
    let tenant = await prisma.tenant.findFirst({ where: { stripeId: subdomain } });
    
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'New York Pizza Tenant',
          stripeId: subdomain
        }
      });
    }

    // 3. Create/Update the Business
    const businessData = {
      name: 'New York Pizza and Kabob',
      type: 'restaurant',
      phoneNumber: '+15097977710',
      address: '123 Main St',
      city: 'New York',
      country: 'USA',
      tenantId: tenant.id,
      orderSmsEnabled: true,
      currency: 'USD'
    };

    let business = await prisma.business.findFirst({ where: { tenantId: tenant.id } });
    
    if (business) {
      business = await prisma.business.update({
        where: { id: business.id },
        data: businessData
      });
    } else {
      business = await prisma.business.create({
        data: businessData
      });
    }

    console.log('✅ Master Business Restored:', business.name);

    // 4. Ensure Categories exist
    const categories = ['Pizzas', 'Burgers', 'Wings'];
    for (const catName of categories) {
      const existingCat = await prisma.menuCategory.findFirst({
        where: { name: catName, businessId: business.id }
      });

      if (!existingCat) {
        await prisma.menuCategory.create({
          data: { 
            name: catName, 
            businessId: business.id,
            tenantId: tenant.id
          }
        });
      }
    }
    
    console.log('✅ Menu structure initialized.');

  } catch (error) {
    console.error('💥 Restoration Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreMasterData();
