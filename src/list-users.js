const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, role: true }
  });
  console.log('--- SYSTEM USERS ---');
  users.forEach(u => console.log(`${u.role}: ${u.email}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
