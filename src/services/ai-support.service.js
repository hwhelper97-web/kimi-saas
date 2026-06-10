const { OpenAI } = require("openai");
const prisma = require("../config/prisma");

let openai;

/**
 * Generate an AI response for a support conversation
 */
exports.generateAIResponse = async ({ conversationId, tenantId, businessId, customerMessage }) => {
  try {
    if (!openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn("[AI Support] Missing OPENAI_API_KEY. AI support response will be bypassed.");
        return null;
      }
      openai = new OpenAI({ apiKey });
    }

    // 1. Get Support Settings & Knowledge Base context
    const settings = await prisma.supportSettings.findUnique({
      where: { businessId }
    });

    if (!settings || !settings.aiEnabled) return null;

    // 2. Fetch relevant KB articles (Simple RAG)
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        businessId,
        OR: [
          { title: { contains: customerMessage } },
          { content: { contains: customerMessage } }
        ]
      },
      take: 3
    });

    const kbContext = articles.map(a => `Article: ${a.title}\nContent: ${a.content}`).join("\n\n");

    // 3. Get Conversation History
    const history = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    const messages = [
      { 
        role: "system", 
        content: `You are ${settings.aiName}, an AI Support Agent for a business. 
        Use the following Knowledge Base articles to answer customer questions.
        If you cannot find the answer, politely offer to escalate to a human agent.
        
        KNOWLEDGE BASE:
        ${kbContext}
        
        PERSONALITY: ${settings.aiSystemPrompt || "Helpful, professional, and concise."}` 
      },
      ...history.reverse().map(m => ({
        role: m.senderType === "CUSTOMER" ? "user" : "assistant",
        content: m.content
      })),
      { role: "user", content: customerMessage }
    ];

    // 4. Call OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "book_appointment",
            description: "Book an appointment for the customer",
            parameters: {
              type: "object",
              properties: {
                serviceName: { type: "string" },
                time: { type: "string", description: "ISO date string" }
              },
              required: ["serviceName", "time"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "escalate_to_human",
            description: "Transfer the conversation to a human support agent"
          }
        }
      ]
    });

    const aiMsg = response.choices[0].message;

    // 5. Handle Function Calls
    if (aiMsg.tool_calls) {
      for (const tool of aiMsg.tool_calls) {
        if (tool.function.name === "escalate_to_human") {
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { aiHandled: false, status: "open" }
          });
          return "I am transferring you to one of our human support agents. Please wait a moment.";
        }
        if (tool.function.name === "book_appointment") {
          const args = JSON.parse(tool.function.arguments);
          await prisma.appointment.create({
            data: {
              customerName: "Voice/Chat Customer",
              serviceName: args.serviceName,
              appointmentTime: new Date(args.time),
              tenantId,
              businessId,
              status: "CONFIRMED",
              notes: "Booked via AI Assistant"
            }
          });
          return `I have successfully booked your ${args.serviceName} appointment for ${new Date(args.time).toLocaleString()}. Is there anything else I can help with?`;
      }
    }

    return aiMsg.content;

  } catch (error) {
    console.error("[AI Support Error]", error);
    return "I'm sorry, I'm having trouble processing your request right now.";
  }
};
