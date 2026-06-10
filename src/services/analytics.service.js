const prisma = require("../config/prisma");

class AnalyticsService {
  /**
   * GET SUPPORT METRICS
   * Aggregates key performance indicators for a tenant.
   */
  async getMetrics(tenantId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const whereFilter = {
      createdAt: { gte: startDate }
    };
    if (tenantId) {
      whereFilter.tenantId = tenantId;
    }

    const tickets = await prisma.ticket.findMany({
      where: whereFilter,
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        activities: { where: { action: "SLA_BREACH" } }
      }
    });

    const totalTickets = tickets.length;
    const resolvedTickets = tickets.filter(t => t.status === "resolved");
    const openTickets = tickets.filter(t => t.status === "open" || t.status === "escalated");

    // 1. Response Times (Avg)
    let totalResponseTime = 0;
    let responsiveCount = 0;

    tickets.forEach(t => {
      const firstAgentMsg = t.messages.find(m => m.senderType === "AGENT");
      if (firstAgentMsg) {
        const diff = (new Date(firstAgentMsg.createdAt) - new Date(t.createdAt)) / 60000;
        totalResponseTime += diff;
        responsiveCount++;
      }
    });

    const avgResponseTime = responsiveCount > 0 ? (totalResponseTime / responsiveCount).toFixed(1) : 0;

    // 2. Resolution Times (Avg)
    let totalResolutionTime = 0;
    resolvedTickets.forEach(t => {
      if (t.resolvedAt) {
        const diff = (new Date(t.resolvedAt) - new Date(t.createdAt)) / 3600000;
        totalResolutionTime += diff;
      }
    });

    const avgResolutionTime = resolvedTickets.length > 0 ? (totalResolutionTime / resolvedTickets.length).toFixed(1) : 0;

    // 3. SLA Compliance
    const breachedCount = tickets.filter(t => t.activities.length > 0).length;
    const slaCompliance = totalTickets > 0 ? (((totalTickets - breachedCount) / totalTickets) * 100).toFixed(1) : 100;

    // 4. Volume Trends
    const trends = {};
    tickets.forEach(t => {
      const day = t.createdAt.toISOString().split("T")[0];
      trends[day] = (trends[day] || 0) + 1;
    });

    const groupByFilter = {
      by: ["assignedToId"],
      where: { 
        status: "resolved",
        ...(tenantId ? { tenantId } : {})
      },
      _count: { id: true }
    };

    const agentStats = await prisma.ticket.groupBy(groupByFilter);

    const agentIds = agentStats.map(s => s.assignedToId).filter(Boolean);
    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, email: true }
    });

    const leaderboard = agentStats
      .map(stat => {
        const agent = agents.find(a => a.id === stat.assignedToId);
        return agent ? { email: agent.email, resolvedCount: stat._count.id } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.resolvedCount - a.resolvedCount);

    return {
      summary: {
        totalTickets,
        resolvedTickets: resolvedTickets.length,
        openTickets: openTickets.length,
        avgResponseTime,
        avgResolutionTime,
        slaCompliance
      },
      trends: Object.entries(trends).map(([day, count]) => ({ day, count })),
      leaderboard
    };
  }
}

module.exports = new AnalyticsService();
