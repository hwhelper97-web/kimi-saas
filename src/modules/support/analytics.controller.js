const analyticsService = require("../../services/analytics.service");

exports.getTenantMetrics = async (req, res) => {
  try {
    const { days } = req.query;
    // If superadmin, fetch global metrics (null tenantId)
    const targetTenantId = req.user.role === 'SUPERADMIN' ? null : req.tenantId;
    const metrics = await analyticsService.getMetrics(targetTenantId, parseInt(days) || 30);
    return res.json({ success: true, data: metrics });
  } catch (error) {
    console.error("[AnalyticsController] Error:", error);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
};
