const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function reset() {
  const emails = ['newyorkpizza@owner.com', 'haya@owner.com', 'khanji@owner.com'];
  const newPassword = 'password';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  for (const email of emails) {
    try {
      await prisma.user.update({
        where: { email: email },
        data: { password: hashedPassword }
      });
      console.log(`Reset: ${email}`);
    } catch (e) {
      console.log(`Skipped: ${email} (Not found)`);
    }
  }
}

reset().catch(console.error).finally(() => prisma.$disconnect());
