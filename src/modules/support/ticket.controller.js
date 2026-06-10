const ticketService = require("./ticket.service");

exports.create = async (req, res) => {
  try {
    const ticket = await ticketService.createTicket(req.body, req.tenantId, req.user.id);
    
    // Real-time notification for tenant staff
    const io = req.app.get("io");
    if (io) {
      io.to(`tenant_${req.tenantId}`).emit("ticket-activity", {
        type: "TICKET_CREATED",
        ticketId: ticket.id,
        subject: ticket.subject
      });
    }

    return res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    console.error("[TicketController] Create Error:", error);
    return res.status(500).json({ error: "Failed to create ticket" });
  }
};

exports.update = async (req, res) => {
  try {
    const ticket = await ticketService.updateTicket(req.params.id, req.body, req.tenantId, req.user.id);
    
    const io = req.app.get("io");
    if (io) {
      io.to(`tenant_${req.tenantId}`).emit("ticket-activity", {
        type: "TICKET_UPDATED",
        ticketId: ticket.id,
        status: ticket.status
      });
    }

    return res.json({ success: true, data: ticket });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

exports.assign = async (req, res) => {
  try {
    const { agentId } = req.body;
    const ticket = await ticketService.assignTicket(req.params.id, agentId, req.tenantId, req.user.id);
    
    const io = req.app.get("io");
    if (io) {
      io.to(`tenant_${req.tenantId}`).emit("ticket-activity", {
        type: "TICKET_ASSIGNED",
        ticketId: ticket.id,
        assignedTo: agentId
      });
    }

    return res.json({ success: true, data: ticket });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

exports.addMessage = async (req, res) => {
  try {
    const message = await ticketService.addMessage(req.params.id, req.body, req.tenantId, req.user.id, "AGENT");
    
    const io = req.app.get("io");
    if (io) {
      io.to(`tenant_${req.tenantId}`).emit("ticket-activity", {
        type: "TICKET_MESSAGE",
        ticketId: req.params.id,
        messageId: message.id
      });
    }

    return res.status(201).json({ success: true, data: message });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

exports.escalate = async (req, res) => {
  try {
    const { reason } = req.body;
    const ticket = await ticketService.escalate(req.params.id, req.tenantId, req.user.id, reason);
    
    const io = req.app.get("io");
    if (io) {
      io.to(`tenant_${req.tenantId}`).emit("ticket-activity", {
        type: "TICKET_ESCALATED",
        ticketId: ticket.id
      });
    }

    return res.json({ success: true, data: ticket });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const tickets = await ticketService.listTickets(req.query, req.tenantId);
    return res.json({ success: true, data: tickets });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch tickets" });
  }
};

exports.getById = async (req, res) => {
  try {
    const prisma = require("../../config/prisma");
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        customer: true,
        tenant: true,
        assignedTo: true,
        department: true,
        messages: { orderBy: { createdAt: "asc" } },
        activities: { orderBy: { createdAt: "desc" } },
        attachments: true,
        tags: true
      }
    });
    
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    return res.json({ success: true, data: ticket });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch ticket" });
  }
};
