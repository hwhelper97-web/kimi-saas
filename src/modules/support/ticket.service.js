const prisma = require("../../config/prisma");
const notificationService = require("../../services/notification.service");

class TicketService {
  /**
   * CREATE TICKET
   */
  async createTicket(data, tenantId, creatorId) {
    return prisma.ticket.create({
      data: {
        ...data,
        tenantId,
        createdById: creatorId,
        status: "open",
      },
      include: {
        customer: true,
        department: true,
      }
    });
  }

  /**
   * UPDATE TICKET
   */
  async updateTicket(ticketId, data, tenantId, actorId) {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, tenantId }
    });

    if (!ticket) throw new Error("Ticket not found");

    // Track activity for changes
    const updates = [];
    for (const key in data) {
      if (ticket[key] !== data[key]) {
        updates.push(prisma.ticketActivity.create({
          data: {
            ticketId,
            actorId,
            action: `${key.toUpperCase()}_CHANGE`,
            oldValue: String(ticket[key]),
            newValue: String(data[key])
          }
        }));
      }
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...data,
        resolvedAt: data.status === "resolved" ? new Date() : ticket.resolvedAt
      }
    });

    await Promise.all(updates);
    return updatedTicket;
  }

  /**
   * ASSIGN TICKET
   */
  async assignTicket(ticketId, agentId, tenantId, actorId) {
    const updated = await prisma.ticket.update({
      where: { id: ticketId, tenantId },
      data: { assignedToId: agentId },
      include: { assignedTo: true }
    });

    await prisma.ticketActivity.create({
      data: {
        ticketId,
        actorId,
        action: "ASSIGNMENT",
        newValue: agentId
      }
    });

    // Notify agent
    await notificationService.send({
      tenantId,
      userId: agentId,
      title: "New Ticket Assigned",
      message: `You have been assigned ticket: ${updated.subject}`,
      type: "TICKET_ASSIGNED"
    });

    return updated;
  }

  /**
   * ADD MESSAGE / INTERNAL NOTE
   */
  async addMessage(ticketId, data, tenantId, senderId, senderType) {
    return prisma.ticketMessage.create({
      data: {
        ticketId,
        body: data.body,
        isInternal: data.isInternal || false,
        senderId,
        senderType, // AGENT, CUSTOMER, SYSTEM
      }
    });
  }

  /**
   * ESCALATE TICKET
   */
  async escalate(ticketId, tenantId, actorId, reason) {
    return this.updateTicket(ticketId, { 
      status: "escalated", 
      priority: "urgent",
      resolutionNotes: `Escalated: ${reason}`
    }, tenantId, actorId);
  }

  /**
   * SEARCH / FILTER
   */
  async listTickets(filters, tenantId) {
    const { status, priority, departmentId, assignedToId, search } = filters;
    
    const where = { tenantId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (departmentId) where.departmentId = departmentId;
    if (assignedToId) where.assignedToId = assignedToId;
    
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return prisma.ticket.findMany({
      where,
      include: {
        customer: true,
        assignedTo: { select: { id: true, email: true } },
        department: true,
      },
      orderBy: { updatedAt: "desc" }
    });
  }
}

module.exports = new TicketService();
