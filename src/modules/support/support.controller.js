const prisma = require("../../config/prisma");

exports.listConversations = async (req, res) => {
  const { businessId } = req.query;
  try {
    const where = {};
    const isSuperAdmin = req.user?.role?.toUpperCase() === "SUPERADMIN";
    
    if (!isSuperAdmin) {
      where.tenantId = req.tenantId;
    }

    if (businessId) where.businessId = businessId;

    const convos = await prisma.conversation.findMany({
      where,
      include: { 
        customer: true,
        tenant: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { updatedAt: "desc" }
    });
    
    res.json({ success: true, data: convos });
  } catch (e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
};

exports.getMessages = async (req, res) => {
  const { id } = req.params;
  const userRole = req.user?.role?.toUpperCase();
  const isAgent = ["AGENT", "ADMIN", "OWNER", "SUPERADMIN", "MANAGER", "PRODUCT", "DEVELOPER"].includes(userRole);
  
  try {
    const where = { conversationId: id };
    if (!isAgent) {
      where.isInternal = false;
    }

    const messages = await prisma.conversationMessage.findMany({
      where,
      orderBy: { createdAt: "asc" }
    });
    res.json({ success: true, data: messages });
  } catch (e) { 
    console.error(`[SUPPORT_ERROR] getMessages failed for convo ${id}:`, e);
    res.status(500).json({ success: false, message: e.message, stack: process.env.NODE_ENV === 'development' ? e.stack : undefined }); 
  }
};

exports.startConversation = async (req, res) => {
  const { name, email } = req.body;
  const tenantId = req.tenantId; // Use tenantId from middleware
  try {
    if (!tenantId) {
       return res.status(400).json({ success: false, message: "Tenant ID required" });
    }
    let customer = await prisma.customer.findFirst({
      where: { tenantId, email }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: { tenantId, name, email, phone: "PLATFORM_" + Date.now() }
      });
    }

    let convo = await prisma.conversation.findFirst({
      where: { tenantId, customerId: customer.id, status: "open" }
    });

    if (!convo) {
      convo = await prisma.conversation.create({
        data: {
          tenantId,
          customerId: customer.id,
          status: "open",
        }
      });
    }

    res.json({ success: true, conversationId: convo.id });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.sendMessage = async (req, res) => {
  const { id } = req.params;
  const { body, senderType, isInternal } = req.body;
  try {
    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: id,
        body,
        senderType: senderType || "AGENT",
        senderId: req.user?.id || "SYSTEM",
        isInternal: isInternal || false
      }
    });
    
    // Update Conversation Timestamp
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() }
    });

    // Broadcast via Socket.IO if available
    const io = req.app.get("io");
    if (io) {
      io.to(`convo_${id}`).emit("new-message", message);
      // Also notify tenant room for activity feed
      if (senderType === "CUSTOMER") {
        io.to(`tenant_${req.tenantId}`).emit("ticket-activity", {
          type: "NEW_CHAT_MESSAGE",
          conversationId: id,
          snippet: body.substring(0, 50)
        });
      }
    }

    res.json({ success: true, data: message });
  } catch (e) { 
    console.error(`[SUPPORT_ERROR] sendMessage failed for convo ${id}:`, e);
    res.status(500).json({ success: false, message: e.message, stack: process.env.NODE_ENV === 'development' ? e.stack : undefined }); 
  }
};

exports.updateConversation = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const updated = await prisma.conversation.update({
      where: { id },
      data: { status }
    });
    res.json({ success: true, status: updated.status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
