const prisma = require("../../config/prisma");

module.exports = (io, socket, onlineUsers) => {
  const { id: userId, tenantId, role } = socket.user;

  /**
   * Join Conversation Room
   */
  socket.on("join-conversation", async ({ conversationId }) => {
    socket.join(`convo_${conversationId}`);
    
    // Notify room that user is viewing
    socket.to(`convo_${conversationId}`).emit("user-viewing", { userId, isViewing: true });
    
    console.log(`[Chat] User ${userId} joined convo ${conversationId}`);
  });

  /**
   * Leave Conversation Room
   */
  socket.on("leave-conversation", async ({ conversationId }) => {
    socket.leave(`convo_${conversationId}`);
    socket.to(`convo_${conversationId}`).emit("user-viewing", { userId, isViewing: false });
    console.log(`[Chat] User ${userId} left convo ${conversationId}`);
  });

  /**
   * Send Message
   */
  socket.on("send-message", async (data) => {
    const { conversationId, body, senderType, isInternal } = data;

    try {
      const message = await prisma.conversationMessage.create({
        data: {
          conversationId,
          senderId: userId,
          senderType: senderType || role,
          body,
          isInternal: isInternal || false
        }
      });

      // Update Conversation Timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });

      // Broadcast to room
      if (isInternal) {
         // Emit specifically for agents
         io.to(`convo_${conversationId}`).emit("new-internal-message", message);
      } else {
         io.to(`convo_${conversationId}`).emit("new-message", message);
      }

      // Real-time Notification for Agents (if from customer)
      if (senderType === "CUSTOMER") {
        io.to(`tenant_${tenantId}`).emit("ticket-activity", {
          type: "NEW_CHAT_MESSAGE",
          conversationId,
          snippet: body.substring(0, 50)
        });
      }

    } catch (error) {
      console.error("[Chat Handler] Send Error:", error);
      socket.emit("error", { message: "Message delivery failed" });
    }
  });

  /**
   * Typing Indicators
   */
  socket.on("typing", ({ conversationId, isTyping }) => {
    socket.to(`convo_${conversationId}`).emit("user-typing", { 
      userId, 
      isTyping 
    });
  });

  /**
   * Ticket Status Updates
   */
  socket.on("ticket-update", async (data) => {
    const { ticketId, status, priority } = data;
    // Broadcast to all staff in tenant
    io.to(`tenant_${tenantId}`).emit("ticket-state-changed", {
      ticketId,
      status,
      priority,
      updatedBy: userId
    });
  });

  /**
   * Get Online Staff (Request/Response)
   */
  socket.on("get-online-staff", () => {
    const staff = Array.from(onlineUsers.values())
      .filter(u => u.tenantId === tenantId && (u.role === "AGENT" || u.role === "ADMIN" || u.role === "OWNER" || u.role === "SUPERADMIN"))
      .map(u => u.userId);
    
    socket.emit("online-staff-list", staff);
  });
};
