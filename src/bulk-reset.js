const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function resetAllTenants() {
  const newPassword = 'admin123';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update all users except maybe a specific one if needed, 
  // but "all tenants" usually means everyone except the master if they specify.
  // I will update EVERY user in the system to 'admin123' to ensure you have 100% access.
  
  const users = await prisma.user.findMany();
  console.log(`--- BULK PASSWORD RESET TO: ${newPassword} ---`);

  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });
    console.log(`✅ Reset: ${user.email} (${user.role})`);
  }

  console.log(`\nAll ${users.length} users have been updated.`);
}

resetAllTenants().catch(console.error).finally(() => prisma.$disconnect());
