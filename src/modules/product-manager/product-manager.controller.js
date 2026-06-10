const prisma = require("../../config/prisma");

exports.getDashboard = async (req, res) => {
  try {
    // Product Overview Stats
    const totalTenants = await prisma.tenant.count();
    const featureRequests = await prisma.ticket.count({ where: { category: "FEATURE" } });
    
    // AI Usage summary (Mocking trend for now)
    const aiStats = {
      totalTokens: "14.2M",
      avgSuccessRate: "99.2%",
      activeAgents: 142
    };

    res.render("product-manager-dashboard", {
      user: req.user,
      stats: {
        tenants: totalTenants,
        requests: featureRequests,
        feedbackCount: 24,
        adoptionRate: "78%",
        aiEfficiency: "92%"
      },
      aiStats
    });
  } catch (error) {
    console.error("Product Manager Dashboard Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    // Mock analytics for product growth and adoption
    const analytics = {
      adoption: [65, 68, 72, 75, 78, 82, 85],
      usage: [1200, 1450, 1300, 1600, 1800, 1750, 1900],
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"]
    };
    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getFeatureRequests = async (req, res) => {
  try {
    const requests = await prisma.ticket.findMany({
      where: { category: "FEATURE" },
      include: { tenant: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getRoadmap = async (req, res) => {
  try {
    // Mock roadmap data
    const roadmap = [
      { id: 1, title: "Custom AI Voice Profiles", status: "In Progress", priority: "High", milestone: "Q4 2024" },
      { id: 2, title: "Multi-language Support (Beta)", status: "Planning", priority: "Medium", milestone: "Q1 2025" },
      { id: 3, title: "Advanced Analytics Dashboard", status: "Testing", priority: "Critical", milestone: "Oct 2024" },
      { id: 4, title: "Direct CRM Integrations", status: "Backlog", priority: "Low", milestone: "TBD" }
    ];
    res.json({ success: true, data: roadmap });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTenantInsights = async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { users: true, businesses: true }
        }
      }
    });
    res.json({ success: true, data: tenants });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
