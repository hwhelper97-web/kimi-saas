const prisma = require("../../config/prisma");

exports.listConversations = async (req, res) => {
  const { businessId } = req.query;
  try {
    const where = {};
    
    // Security: Only SuperAdmins can see everything. 
    // Regular tenants only see their own data.
    const isSuperAdmin = req.user?.role?.toUpperCase() === "SUPERADMIN";
    if (!isSuperAdmin) {
      where.tenantId = req.tenantId;
    }

    if (businessId) where.businessId = businessId;

    const convos = await prisma.conversation.findMany({
      where,
      include: { 
        customer: true,
        business: true,
        tenant: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { lastMessageAt: "desc" }
    });
    console.log(`[Support] listing convos for ${req.user.email} (Role: ${req.user.role}). Found: ${convos.length}`);
    res.json({ success: true, data: convos });
  } catch (e) { 
    console.error("LIST CONVOS ERROR:", e);
    res.status(500).json({ success: false, message: e.message }); 
  }
};

exports.getMessages = async (req, res) => {
  const { id } = req.params;
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    res.json({ success: true, data: messages });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.toggleAI = async (req, res) => {
  const { id } = req.params;
  try {
    const convo = await prisma.conversation.findUnique({ where: { id } });
    const updated = await prisma.conversation.update({
      where: { id },
      data: { aiHandled: !convo.aiHandled }
    });
    res.json({ success: true, aiHandled: updated.aiHandled });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.startConversation = async (req, res) => {
  const { tenantId, businessId, name, email } = req.body;
  try {
    let customer = await prisma.customer.findFirst({
      where: { tenantId, email }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: { tenantId, name, email, phone: "Platform" }
      });
    }

    let convo = await prisma.conversation.findFirst({
      where: { tenantId, customerId: customer.id, status: "open" }
    });

    if (!convo) {
      convo = await prisma.conversation.create({
        data: {
          tenantId,
          businessId,
          customerId: customer.id,
          status: "open",
          aiHandled: true
        }
      });
    }

    res.json({ success: true, conversationId: convo.id });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.createTicket = async (req, res) => {
  const { tenantId, businessId, title, description, email, priority, category } = req.body;
  try {
    let customer = await prisma.customer.findFirst({ where: { tenantId, email } });
    if (!customer) {
      customer = await prisma.customer.create({ 
        data: { 
          tenantId, 
          email, 
          name: email.split("@")[0], 
          phone: req.body.phone || ("PLATFORM_" + Date.now())
        } 
      });
    }

    const ticket = await prisma.ticket.create({
      data: {
        tenantId,
        businessId: businessId || null,
        customerId: customer.id,
        title,
        description,
        status: "open",
        priority: priority || "medium",
        tags: category || "general"
      }
    });
    res.json({ success: true, data: ticket });
  } catch (e) { 
    console.error("TICKET ERROR:", e);
    res.status(500).json({ success: false, message: e.message }); 
  }
};

exports.getOrCreateConversation = async (req, res) => {
  const { tenantId, email } = req.user;
  try {
    let customer = await prisma.customer.findFirst({ where: { tenantId, email } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { tenantId, email, name: email.split("@")[0], phone: "PLATFORM_" + Date.now() }
      });
    }

    let convo = await prisma.conversation.findFirst({
      where: { tenantId, customerId: customer.id, status: "open" }
    });

    if (!convo) {
      convo = await prisma.conversation.create({
        data: { tenantId, customerId: customer.id, status: "open", aiHandled: true }
      });
    }
    res.redirect(`/support/chat/${convo.id}`);
  } catch (e) {
    res.status(500).send("Error initializing support session: " + e.message);
  }
};

exports.sendMessage = async (req, res) => {
  const { id } = req.params;
  const { content, role } = req.body;
  try {
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        content,
        senderType: role === "admin" ? "AGENT" : "CUSTOMER",
        senderId: req.user?.id || "SYSTEM"
      }
    });
    
    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() }
    });

    res.json({ success: true, data: message });
  } catch (e) { 
    console.error("SEND TENANT MESSAGE ERROR:", e);
    res.status(500).json({ success: false, message: e.message }); 
  }
};

exports.resolveActiveConversation = async (req, res) => {
  const tenantId = req.tenantId;
  try {
    const updated = await prisma.conversation.updateMany({
      where: { 
        tenantId, 
        status: { not: "resolved" } 
      },
      data: { status: "resolved" }
    });
    res.json({ success: true, count: updated.count });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.resolveConversation = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const updated = await prisma.conversation.update({
      where: { id },
      data: { 
        status: status || "resolved", 
        aiHandled: false 
      }
    });
    res.json({ success: true, status: updated.status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.listTickets = async (req, res) => {
  const { tenantId, role } = req.user;
  const { businessId } = req.query;

  try {
    const where = {};
    
    // SuperAdmin sees everything unless filtered by business
    const isSuperAdmin = role && role.toLowerCase() === "superadmin";
    
    if (!isSuperAdmin) {
      where.tenantId = tenantId;
    }

    if (businessId) {
      where.businessId = businessId;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        customer: true,
        tenant: { select: { name: true } },
        business: { select: { name: true } },
        assignedTo: { select: { email: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: tickets });
  } catch (e) {
    console.error("LIST TICKETS ERROR:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateTicketStatus = async (req, res) => {
  const { id } = req.params;
  const { status, responseText } = req.body;
  
  if (!id) return res.status(400).json({ success: false, message: "Ticket ID required" });

  try {
    // Explicitly update the status and include relations for the response logic
    const updated = await prisma.ticket.update({
      where: { id: String(id) },
      data: { 
        status: String(status || "closed").toLowerCase() 
      },
      include: { customer: true, tenant: true, business: true }
    });

    console.log(`[SUPPORT] Ticket ${id} status updated to: ${updated.status}`);

    // Send response message to the tenant/customer
    if (responseText && updated.customerId) {
      // Find or create a conversation for this customer/tenant
      let convo = await prisma.conversation.findFirst({
        where: {
          customerId: updated.customerId,
          tenantId: updated.tenantId,
          status: { not: "resolved" }
        },
        orderBy: { updatedAt: "desc" }
      });

      if (!convo) {
        convo = await prisma.conversation.create({
          data: {
            customerId: updated.customerId,
            tenantId: updated.tenantId,
            businessId: updated.businessId || "", // fallback if no business linked
            status: "open",
            lastMessageAt: new Date()
          }
        });
      }

      // Create the resolution message
      await prisma.message.create({
        data: {
          conversationId: convo.id,
          senderType: "ADMIN",
          content: `TICKET RESOLUTION [${updated.title}]: ${responseText}`,
          metadata: JSON.stringify({ ticketId: updated.id, type: "resolution" })
        }
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: convo.id },
        data: { lastMessageAt: new Date() }
      });
    }

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error("UPDATE TICKET ERROR:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};exports.sendTenantMessage = async (req, res) => {
  const { content } = req.body;
  const tenantId = req.tenantId; // From authMiddleware
  const businessId = req.businessId; // From authMiddleware
  const email = req.user?.email || "tenant@nexton.ai";

  if (!content) return res.status(400).json({ success: false, message: "Content required" });

  try {
    // 1. Identify or create customer for this tenant user
    let customer = await prisma.customer.findFirst({ where: { tenantId, email } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { 
          tenantId, 
          email, 
          name: req.user?.email ? req.user.email.split("@")[0] : "Tenant Admin", 
          phone: "TENANT_USER_" + Date.now() 
        }
      });
    }

    // 2. Identify active conversation or create one
    let convo = await prisma.conversation.findFirst({
      where: { 
        tenantId, 
        customerId: customer.id, 
        status: { not: "resolved" } 
      },
      orderBy: { createdAt: "desc" }
    });

    if (!convo) {
      // Find the first business for this tenant to satisfy the required relation
      let bId = businessId;
      if (!bId) {
        const firstBiz = await prisma.business.findFirst({ where: { tenantId } });
        bId = firstBiz?.id; 
      }

      if (!bId) {
        console.error(`[Support] Error: Tenant ${tenantId} has NO businesses. Cannot create conversation.`);
        return res.status(400).json({ success: false, message: "Infrastructure missing: No business node found for your account. Please create a business branch first." });
      }

      convo = await prisma.conversation.create({
        data: {
          tenantId,
          customerId: customer.id,
          businessId: bId, 
          status: "open",
          lastMessageAt: new Date()
        }
      });
    }

    // 3. Create the message
    const message = await prisma.message.create({
      data: {
        conversationId: convo.id,
        content,
        senderType: "CUSTOMER",
        senderId: req.user?.id || "TENANT_USER"
      }
    });

    // 4. Update conversation timestamp
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { lastMessageAt: new Date() }
    });

    console.log(`[Support] Message sent from tenant ${tenantId} in convo ${convo.id}`);
    res.json({ success: true, data: message });
  } catch (e) {
    console.error("SEND TENANT MESSAGE ERROR:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};

