const prisma = require("./config/prisma");
const bcrypt = require("bcrypt");
require("dotenv").config();

async function resetProduct() {
  try {
    const email = "product@naxton.ai";
    const password = "password123";
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get first tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      console.log("No tenant found. Please run seed first.");
      return;
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        password: hashedPassword,
        role: "PRODUCT",
        tenantId: tenant.id
      },
      create: {
        email,
        password: hashedPassword,
        role: "PRODUCT",
        tenantId: tenant.id
      }
    });

    console.log("==========================================");
    console.log("PRODUCT MANAGER ACCOUNT CREATED/RESET");
    console.log("==========================================");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Role: ${user.role}`);
    console.log("==========================================");

  } catch (error) {
    console.error("Error resetting product:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetProduct();
