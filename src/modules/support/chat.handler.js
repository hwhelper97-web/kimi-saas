const prisma = require("../../config/prisma");

module.exports = (io, socket) => {
  // Join a specific conversation room
  socket.on("join-conversation", async ({ conversationId, userId, customerId }) => {
    socket.join(conversationId);
    console.log(`[Chat] Socket ${socket.id} joined conversation: ${conversationId}`);
    
    // Update online status (if it's a customer)
    if (customerId) {
      // In a real app, you'd use Redis to track online status
      io.to(conversationId).emit("presence-update", { customerId, status: "online" });
    }
  });

  // Handle new message
  socket.on("send-message", async (data) => {
    const { conversationId, senderId, senderType, content, contentType, tenantId } = data;

    try {
      // 1. Save message to DB
      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: senderType === "AGENT" ? senderId : null,
          customerId: senderType === "CUSTOMER" ? senderId : null,
          senderType,
          content,
          contentType: contentType || "text",
        }
      });

      // 2. Update conversation lastMessageAt
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() }
      });

      // 3. Broadcast to the room
      io.to(conversationId).emit("new-message", message);

      // 4. If it's a customer message, trigger AI response logic
      if (senderType === "CUSTOMER") {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId }
        });

        if (conversation && conversation.aiHandled) {
          // Emit "AI is typing" status
          io.to(conversationId).emit("user-typing", { senderName: "AI Assistant", isTyping: true });

          const { generateAIResponse } = require("../../services/ai-support.service");
          const aiResponseContent = await generateAIResponse({
            conversationId,
            tenantId,
            businessId: conversation.businessId,
            customerMessage: content
          });

          if (aiResponseContent) {
            // Save AI message
            const aiMessage = await prisma.message.create({
              data: {
                conversationId,
                senderType: "AI",
                content: aiResponseContent
              }
            });

            // Stop typing status
            io.to(conversationId).emit("user-typing", { senderName: "AI Assistant", isTyping: false });
            
            // Broadcast AI response
            io.to(conversationId).emit("new-message", aiMessage);
          }
        }
      }

    } catch (error) {
      console.error("[Chat Error] Failed to save/send message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Typing indicators
  socket.on("typing-start", ({ conversationId, senderName }) => {
    socket.to(conversationId).emit("user-typing", { senderName, isTyping: true });
  });

  socket.on("typing-stop", ({ conversationId, senderName }) => {
    socket.to(conversationId).emit("user-typing", { senderName, isTyping: false });
  });

  socket.on("disconnect", () => {
    console.log(`[Chat] Socket disconnected: ${socket.id}`);
  });
};
