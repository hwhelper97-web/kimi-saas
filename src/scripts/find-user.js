const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ where: { role: 'SUPERADMIN' }, take: 1 });
  console.log(JSON.stringify(users, null, 2));
}
main().finally(() => prisma.$disconnect());
