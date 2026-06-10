const prisma = require("../../config/prisma");

exports.getDashboard = async (req, res) => {
  try {
    const agentId = req.user.id;

    // Stats for the agent
    const assignedTicketsCount = await prisma.ticket.count({
      where: { assignedToId: agentId, status: { not: "resolved" } }
    });

    const openConversationsCount = await prisma.conversation.count({
      where: { assignedToId: agentId, status: "open" }
    });

    // Real stats
    const waitingResponsesCount = await prisma.conversation.count({
      where: { 
        assignedToId: agentId, 
        status: "open",
        messages: { some: { senderType: "CUSTOMER" } } // Simplification
      }
    });

    // Avg response time (mocked for now but with a real-ish query structure)
    // In a real system, you'd calculate the diff between customer message and agent response.
    const avgResponseTime = "8m"; 

    // CSAT based on call sentiments
    const calls = await prisma.call.findMany({
      where: { tenantId: req.user.tenantId },
      select: { sentimentScore: true },
      take: 100
    });
    const avgScore = calls.length > 0 ? (calls.reduce((a, b) => a + (b.sentimentScore || 0), 0) / calls.length) : 0.8;
    const csat = (avgScore * 5).toFixed(1) + "/5";

    const unresolvedTickets = await prisma.ticket.findMany({
      where: { assignedToId: agentId, status: { not: "resolved" } },
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
    const tickets = await prisma.ticket.findMany({
      where: {
        assignedToId: req.user.id
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
    const convos = await prisma.conversation.findMany({
      where: {
        OR: [
          { assignedToId: req.user.id },
          { assignedToId: null, status: "open" } // Unassigned queue
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
    const { type, note } = req.body; // type: 'TECHNICAL' (to DEV), 'BILLING' (to MANAGER)

    const ticket = await prisma.ticket.update({
      where: { id },
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

    // Add internal note
    await prisma.ticketMessage.create({
      data: {
        ticketId: id,
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
    const articles = await prisma.knowledgeArticle.findMany({
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
    const customers = await prisma.customer.findMany({
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
    await prisma.knowledgeArticle.delete({ where: { id } });
    res.json({ success: true, message: "Article deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
