const dashboardService = require("./dashboard.service");
const prisma = require("../../config/prisma");

async function validateBusinessAccess(req, tenantId, businessId) {
  if (!businessId) {
    return null;
  }

  const whereClause = req.user.role === "SUPERADMIN" ? { id: businessId } : { id: businessId, tenantId };
  return prisma.business.findFirst({
    where: whereClause
  });
}

exports.getAnalytics = async (req, res) => {
  try {
    if (!req.user || (!req.user.tenantId && req.user.role !== "SUPERADMIN")) {
      return res.status(401).json({
        error: "Unauthorized access"
      });
    }

    const tenantId = req.tenantId || req.user.tenantId || null;
    const { businessId } = req.query;

    if (businessId) {
      const business = await validateBusinessAccess(req, tenantId, businessId);

      if (!business) {
        return res.status(403).json({
          success: false,
          error: "Invalid business"
        });
      }
    }

    const analytics = await dashboardService.getAnalytics(tenantId, businessId || null, req.user.role);
    
    // 🧩 Feature Gate: Tag the response with feature availability
    const { hasFeature } = require("../../constants/plans");
    const tenantPlan = analytics.tenant?.plan || "nexa_core";
    const canSeeAdvanced = hasFeature(tenantPlan, "ADVANCED_ANALYTICS");

    res.json({
      success: true,
      data: analytics,
      features: {
        advancedAnalytics: canSeeAdvanced
      }
    });
  } catch (err) {
    console.error("Dashboard Analytics Error:", err);

    res.status(500).json({
      success: false,
      error: "Failed to load analytics"
    });
  }
};

exports.getLiveCalls = async (req, res) => {
  try {
    if (!req.user || (!req.user.tenantId && req.user.role !== "SUPERADMIN")) {
      return res.status(401).json({
        error: "Unauthorized access"
      });
    }

    const tenantId = req.tenantId || req.user.tenantId || null;
    const { businessId } = req.query;

    if (businessId) {
      const business = await validateBusinessAccess(req, tenantId, businessId);

      if (!business) {
        return res.status(403).json({
          success: false,
          error: "Invalid business"
        });
      }
    }

    const whereClause = req.user.role === "SUPERADMIN" 
      ? (businessId ? { businessId } : {}) 
      : { tenantId, ...(businessId ? { businessId } : {}) };

    const calls = await prisma.call.findMany({
      where: whereClause,
      include: {
        business: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    });

    const formatted = calls.map((call) => ({
      id: call.id,
      business: call.business?.name || "Unknown",
      customerName: call.customerName || "Voice Customer",
      fromNumber: call.fromNumber || "Private Line",
      duration: call.duration || 0,
      tokens: call.tokensUsed || 0,
      createdAt: call.createdAt
    }));

    res.json({
      success: true,
      data: formatted
    });
  } catch (err) {
    console.error("Live Calls Error:", err);

    res.status(500).json({
      success: false,
      error: "Failed to load live calls"
    });
  }
};

exports.getTopItems = async (req, res) => {
  try {
    const whereClause = req.user.role === "SUPERADMIN" ? {} : { tenantId: req.tenantId };
    const items = await prisma.orderItem.groupBy({
      by: ["menuItemId"],
      _sum: {
        quantity: true
      },
      where: whereClause,
      orderBy: {
        _sum: {
          quantity: "desc"
        }
      },
      take: 5
    });

    res.json({
      success: true,
      data: items
    });
  } catch (err) {
    console.error("Top items error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch top items"
    });
  }
};

exports.getBusinessDashboard = async (req, res) => {
  try {
    const { businessId } = req.query;

    if (!businessId) {
      return res.status(400).json({
        message: "businessId is required"
      });
    }

    const whereClause = req.user.role === "SUPERADMIN" ? { id: businessId } : { id: businessId, tenantId: req.tenantId };
    const business = await prisma.business.findFirst({
      where: whereClause
    });

    if (!business) {
      return res.status(403).json({
        message: "Invalid business"
      });
    }

    if (req.query.partial === "true") {
      return res.render("business-settings", { 
        business, 
        user: req.user,
        layout: false 
      });
    }

    if (business.type === "restaurant") {
      const menu = await prisma.menuItem.findMany({
        where: { businessId }
      });

      const orders = await prisma.order.findMany({
        where: { businessId }
      });

      return res.json({
        type: "restaurant",
        menu,
        orders
      });
    }

    const services = await prisma.menuItem.findMany({
      where: { businessId }
    });

    return res.json({
      type: business.type,
      services
    });
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);

    res.status(500).json({
      message: "Dashboard failed"
    });
  }
};
