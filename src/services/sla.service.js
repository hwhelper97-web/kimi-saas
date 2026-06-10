const prisma = require("../config/prisma");

class SLAService {
  /**
   * Check if a ticket has breached its SLA
   */
  async checkBreaches(tenantId) {
    const policies = await prisma.sLAPolicy.findMany({ where: { tenantId } });
    const openTickets = await prisma.ticket.findMany({
      where: {
        tenantId,
        status: { in: ["open", "pending", "in_progress", "waiting_customer", "escalated"] },
      },
      include: {
        department: true,
      }
    });

    const breaches = [];

    for (const ticket of openTickets) {
      const policy = policies.find(p => 
        p.priority === ticket.priority && 
        (!p.departmentId || p.departmentId === ticket.departmentId)
      );

      if (!policy) continue;

      // 🚀 PLAN-BASED SLA PRIORITIZATION
      // Flow, Prime, Enterprise get 50% faster SLA handling
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
      const hasPrioritySupport = tenant && ["nexa_flow", "nexa_prime", "enterprise"].includes(tenant.plan);
      
      const effectiveResolutionTime = hasPrioritySupport ? Math.floor(policy.resolutionTime / 2) : policy.resolutionTime;

      const now = new Date();
      const ageInMinutes = Math.floor((now - new Date(ticket.createdAt)) / 60000);

      // Check resolution SLA
      if (ageInMinutes > effectiveResolutionTime) {
        breaches.push({
          ticketId: ticket.id,
          type: "RESOLUTION",
          limit: policy.resolutionTime,
          actual: ageInMinutes
        });
      }
    }

    return breaches;
  }

  /**
   * Log an SLA breach activity
   */
  async logBreach(ticketId, actorId, details) {
    return prisma.ticketActivity.create({
      data: {
        ticketId,
        actorId,
        action: "SLA_BREACH",
        newValue: details,
      }
    });
  }
}

module.exports = new SLAService();
