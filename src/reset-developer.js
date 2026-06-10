const prisma = require("./config/prisma");
const bcrypt = require("bcrypt");
require("dotenv").config();

async function resetDeveloper() {
  try {
    const email = "dev@naxton.ai";
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
        role: "DEVELOPER",
        tenantId: tenant.id
      },
      create: {
        email,
        password: hashedPassword,
        role: "DEVELOPER",
        tenantId: tenant.id
      }
    });

    console.log("==========================================");
    console.log("DEVELOPER ACCOUNT CREATED/RESET");
    console.log("==========================================");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Role: ${user.role}`);
    console.log("==========================================");

  } catch (error) {
    console.error("Error resetting developer:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetDeveloper();
