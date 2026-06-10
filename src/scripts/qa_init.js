const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  const tenants = await prisma.tenant.findMany();
  
  console.log('--- USERS ---');
  users.forEach(u => console.log(`${u.email} | ${u.role}`));
  
  console.log('\n--- TENANTS ---');
  tenants.forEach(t => console.log(`${t.name} | ${t.id}`));
  
  await prisma.$disconnect();
}

main();
