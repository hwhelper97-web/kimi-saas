const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function renameMasterTenant() {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { name: "Nexton Platform Hub" }
    });

    if (tenant) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { name: "Naxton Platform Hub" }
      });
      console.log("Successfully renamed Master Tenant in Database.");
    } else {
      console.log("Master Tenant 'Nexton Platform Hub' not found or already renamed.");
    }
  } catch (e) {
    console.error("Error renaming tenant:", e);
  } finally {
    await prisma.$disconnect();
  }
}

renameMasterTenant();
