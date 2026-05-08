const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function reset() {
  const email = 'syedsaif@syedservices.com.pk';
  const newPassword = 'password';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const user = await prisma.user.update({
    where: { email: email },
    data: { password: hashedPassword }
  });

  console.log(`--- PASSWORD RESET SUCCESSFUL ---`);
  console.log(`User: ${user.email}`);
  console.log(`New Password set to: ${newPassword}`);
}

reset().catch(console.error).finally(() => prisma.$disconnect());
