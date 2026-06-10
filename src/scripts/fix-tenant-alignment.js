const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixTenantData() {
  console.log("🚀 Starting Tenant Data Alignment...");

  // Find all service categories
  const categories = await prisma.serviceCategory.findMany({
    include: { business: true }
  });

  for (const cat of categories) {
    if (cat.business && cat.tenantId !== cat.business.tenantId) {
      console.log(`Fixing Category: ${cat.name} (${cat.id}) -> Correct Tenant: ${cat.business.tenantId}`);
      await prisma.serviceCategory.update({
        where: { id: cat.id },
        data: { tenantId: cat.business.tenantId }
      });
    }
  }

  // Find all services
  const services = await prisma.appointmentService.findMany({
    include: { business: true }
  });

  for (const svc of services) {
    if (svc.business && svc.tenantId !== svc.business.tenantId) {
      console.log(`Fixing Service: ${svc.name} (${svc.id}) -> Correct Tenant: ${svc.business.tenantId}`);
      await prisma.appointmentService.update({
        where: { id: svc.id },
        data: { tenantId: svc.business.tenantId }
      });
    }
  }

  // Find all staff
  const staff = await prisma.staff.findMany({
    include: { business: true }
  });

  for (const s of staff) {
    if (s.business && s.tenantId !== s.business.tenantId) {
      console.log(`Fixing Staff: ${s.name} (${s.id}) -> Correct Tenant: ${s.business.tenantId}`);
      await prisma.staff.update({
        where: { id: s.id },
        data: { tenantId: s.business.tenantId }
      });
    }
  }

  console.log("✅ Data alignment completed.");
}

fixTenantData()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
