const prisma = require("../../config/prisma");

exports.getDashboard = async (req, res) => {
  try {
    const agentId = req.user.id;
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.user.tenantId };

    // Stats for the agent
    const assignedTicketsCount = await prisma.ticket.count({
      where: { assignedToId: agentId, status: { not: "resolved" }, ...tenantFilter }
    });

    const openConversationsCount = await prisma.conversation.count({
      where: { assignedToId: agentId, status: "open", ...tenantFilter }
    });

    // Real stats
    const waitingResponsesCount = await prisma.conversation.count({
      where: { 
        assignedToId: agentId, 
        status: "open",
        ...tenantFilter,
        messages: { some: { senderType: "CUSTOMER" } }
      }
    });

    const avgResponseTime = "8m"; 

    // CSAT based on call sentiments
    const calls = await prisma.call.findMany({
      where: { ...(isSuperAdmin ? {} : { tenantId: req.user.tenantId }) },
      select: { sentimentScore: true },
      take: 100
    });
    const avgScore = calls.length > 0 ? (calls.reduce((a, b) => a + (b.sentimentScore || 0), 0) / calls.length) : 0.8;
    const csat = (avgScore * 5).toFixed(1) + "/5";

    const unresolvedTickets = await prisma.ticket.findMany({
      where: { assignedToId: agentId, status: { not: "resolved" }, ...tenantFilter },
      include: { tenant: true },
      take: 5,
      orderBy: { updatedAt: "desc" }
    });

    res.render("support-agent-dashboard", {
      user: req.user,
      stats: {
        assignedTickets: assignedTicketsCount,
        activeChats: openConversationsCount,
        waitingResponses: waitingResponsesCount,
        avgResponseTime,
        csat
      },
      recentTickets: unresolvedTickets
    });
  } catch (error) {
    console.error("Support Agent Dashboard Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getTickets = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.user.tenantId };

    const tickets = await prisma.ticket.findMany({
      where: {
        assignedToId: req.user.id,
        ...tenantFilter
      },
      include: {
        tenant: true,
        customer: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ success: true, data: tickets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getConversations = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.user.tenantId };

    const convos = await prisma.conversation.findMany({
      where: {
        ...tenantFilter,
        OR: [
          { assignedToId: req.user.id },
          { assignedToId: null, status: "open" }
        ]
      },
      include: {
        customer: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        tenant: true
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ success: true, data: convos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.escalateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, note } = req.body;
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.user.tenantId };

    const existing = await prisma.ticket.findFirst({
      where: { id, ...tenantFilter }
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: "Ticket not found or access denied" });
    }

    const ticket = await prisma.ticket.update({
      where: { id: existing.id },
      data: {
        status: "escalated",
        activities: {
          create: {
            actorId: req.user.id,
            action: "ESCALATED",
            newValue: type,
            oldValue: note
          }
        }
      }
    });

    await prisma.ticketMessage.create({
      data: {
        ticketId: existing.id,
        senderId: req.user.id,
        senderType: "AGENT",
        body: `[ESCALATION to ${type}] ${note}`,
        isInternal: true
      }
    });

    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getKnowledgeBase = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.user.tenantId };

    const articles = await prisma.knowledgeArticle.findMany({
      where: tenantFilter,
      include: { category: true },
      take: 50
    });
    res.json({ success: true, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.user.tenantId };

    const customers = await prisma.customer.findMany({
      where: tenantFilter,
      include: {
        tenant: true,
        _count: {
          select: { tickets: true, conversations: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.user.tenantId };

    const existing = await prisma.knowledgeArticle.findFirst({
      where: { id, ...tenantFilter }
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: "Article not found or access denied" });
    }

    await prisma.knowledgeArticle.delete({ where: { id: existing.id } });
    res.json({ success: true, message: "Article deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
