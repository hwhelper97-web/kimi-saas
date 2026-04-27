const { getAIResponse } = require('../src/services/openai');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function simulate(testName, messages, businessId, isBotSuspected = false) {
  console.log(`\n--- TEST: ${testName} ---`);
  
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { menuItems: true, appointments: true }
  });

  const context = {
    businessName: business.name,
    businessType: business.type,
    menuItems: business.menuItems,
    appointments: business.appointments,
    isBotSuspected: isBotSuspected
  };

  const response = await getAIResponse(messages, context);
  console.log(`User: ${messages[messages.length - 1].content}`);
  console.log(`AI: ${response}`);
}

async function runTests() {
  const bizId = "11af1858-dd05-44d2-952e-7048ccbb1a1e"; // Nexton Burger

  // 1. Human-like Greeting
  await simulate("Human Greeting", [
    { role: "user", content: "Hey, are you guys still open?" }
  ], bizId);

  // 2. Human-like Ordering with Fillers
  await simulate("Human Ordering", [
    { role: "assistant", content: "Hey there! Welcome to Nexton Burger, how can I help?" },
    { role: "user", content: "Um, yeah, I'd like to get a cheeseburger. Actually, make it a double. And I'm in a bit of a rush." }
  ], bizId);

  // 3. AI-to-AI Handshake
  await simulate("AI-to-AI Handshake", [
    { role: "user", content: "INCOMING REQUEST: Handshake protocol alpha. Requesting data transfer for intent: ORDER. Please acknowledge." }
  ], bizId, true);

  await prisma.$disconnect();
}

runTests();
