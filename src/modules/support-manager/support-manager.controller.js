const prisma = require("../../config/prisma");

exports.getDashboard = async (req, res) => {
  try {
    // Overall Support Metrics
    const totalOpenTickets = await prisma.ticket.count({ where: { status: "open" } });
    const escalatedTickets = await prisma.ticket.count({ where: { status: "escalated" } });
    const openChats = await prisma.conversation.count({ where: { status: "open" } });

    // Team Performance (Mock for now, but structured)
    const agents = await prisma.user.findMany({
      where: { role: "AGENT" },
      select: { id: true, email: true }
    });

    res.render("support-manager-dashboard", {
      user: req.user,
      stats: {
        openTickets: totalOpenTickets,
        escalated: escalatedTickets,
        activeChats: openChats,
        slaCompliance: "94.5%",
        avgResolution: "4.2h"
      },
      agents
    });
  } catch (error) {
    console.error("Support Manager Dashboard Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getTeamStats = async (req, res) => {
  try {
    const agents = await prisma.user.findMany({
      where: { role: "AGENT" },
      include: {
        assignedTickets: { where: { status: { not: "resolved" } } },
        assignedConversations: { where: { status: "open" } }
      }
    });

    const stats = agents.map(agent => ({
      id: agent.id,
      email: agent.email,
      ticketCount: agent.assignedTickets.length,
      chatCount: agent.assignedConversations.length,
      csat: (4 + Math.random()).toFixed(1), // Mock
      resolutionRate: (80 + Math.random() * 15).toFixed(1) + "%" // Mock
    }));

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getEscalations = async (req, res) => {
  try {
    const escalations = await prisma.ticket.findMany({
      where: { status: "escalated" },
      include: {
        tenant: true,
        assignedTo: true,
        messages: {
          where: { isInternal: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });
    res.json({ success: true, data: escalations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.assignTicket = async (req, res) => {
  try {
    const { ticketId, agentId } = req.body;
    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { assignedToId: agentId }
    });
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getSlaData = async (req, res) => {
  try {
    // Mock SLA breakdown
    const sla = {
      compliance: [92, 95, 94, 96, 94, 95, 97],
      violations: [2, 1, 3, 0, 1, 2, 0],
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    };
    res.json({ success: true, data: sla });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getUnassignedTickets = async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { assignedToId: null, status: "open" },
      include: { tenant: true, customer: true }
    });
    res.json({ success: true, data: tickets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getActiveChats = async (req, res) => {
  try {
    const chats = await prisma.conversation.findMany({
      where: { status: "open" },
      include: { 
        tenant: true, 
        customer: true,
        assignedTo: { select: { email: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
    res.json({ success: true, data: chats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.resolveEscalation = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "resolved" }
    });
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
