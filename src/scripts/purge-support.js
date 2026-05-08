const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function purge() {
  console.log("🔥 Purging all Support Conversations and Messages...");
  
  try {
    // Order matters due to foreign keys
    const msgCount = await prisma.message.deleteMany({});
    console.log(`✅ Deleted ${msgCount.count} messages.`);
    
    const convoCount = await prisma.conversation.deleteMany({});
    console.log(`✅ Deleted ${convoCount.count} conversations.`);
    
    console.log("✨ Platform Support Inbox is now clean.");
  } catch (e) {
    console.error("❌ Purge failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

purge();
