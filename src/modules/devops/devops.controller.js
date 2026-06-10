const prisma = require("../../config/prisma");
const { ROLES } = require("../../constants/roles");

exports.getOverview = async (req, res) => {
    try {
        const [incidents, tickets, metrics] = await Promise.all([
            prisma.incident.findMany({ where: { status: { not: "resolved" } }, orderBy: { createdAt: 'desc' } }),
            prisma.ticket.findMany({ where: { status: { in: ['open', 'in_progress', 'investigating', 'fixing'] }, priority: { in: ['high', 'urgent', 'critical'] } }, take: 10, orderBy: { createdAt: 'desc' } }),
            prisma.systemMetric.findMany({ take: 50, orderBy: { timestamp: 'desc' } })
        ]);

        res.json({
            success: true,
            data: {
                incidents,
                escalatedTickets: tickets,
                recentMetrics: metrics,
                systemHealth: {
                    api: "99.98%",
                    websocket: "Stable",
                    ai: "Online",
                    twilio: "Connected"
                }
            }
        });
    } catch (err) {
        console.error("[DevOps] Overview Error:", err);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

exports.getIncidents = async (req, res) => {
    try {
        const incidents = await prisma.incident.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: incidents });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.createIncident = async (req, res) => {
    try {
        const { title, description, severity } = req.body;
        const incident = await prisma.incident.create({
            data: { title, description, severity, status: "investigating" }
        });
        res.json({ success: true, data: incident });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getLogs = async (req, res) => {
    try {
        const logs = await prisma.integrationLog.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' },
            include: { integration: true }
        });
        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getMetrics = async (req, res) => {
    try {
        const metrics = await prisma.systemMetric.findMany({
            take: 100,
            orderBy: { timestamp: 'desc' }
        });
        res.json({ success: true, data: metrics });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getInternalTasks = async (req, res) => {
    try {
        const tasks = await prisma.internalTask.findMany({
            where: { assignedToId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: tasks });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
