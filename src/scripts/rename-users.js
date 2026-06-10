const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function renameSystemUsers() {
  try {
    const users = await prisma.user.findMany({
      where: {
        email: { contains: "@nexton.ai" }
      }
    });

    console.log(`Found ${users.length} users with @nexton.ai domain.`);

    for (const user of users) {
      const newEmail = user.email.replace("@nexton.ai", "@naxton.ai");
      await prisma.user.update({
        where: { id: user.id },
        data: { email: newEmail }
      });
      console.log(`Renamed: ${user.email} -> ${newEmail}`);
    }

    console.log("System users renamed successfully.");
  } catch (e) {
    console.error("Error renaming users:", e);
  } finally {
    await prisma.$disconnect();
  }
}

renameSystemUsers();
