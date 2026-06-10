const prisma = require("../../config/prisma");

exports.getConfigs = async (req, res) => {
  try {
    const { businessId } = req.query;
    const tenantId = req.user.tenantId;

    const whereClause = req.user.role === "SUPERADMIN" 
      ? (businessId ? { businessId } : {}) 
      : { tenantId, ...(businessId ? { businessId } : {}) };

    const configs = await prisma.tenantPhoneNumber.findMany({
      where: whereClause,
      include: { business: true }
    });

    res.json({ success: true, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const { businessId, businessPhoneNumber, transferNumber, fallbackNumber, aiEnabled, recordingEnabled, forwardingEnabled, businessHours } = req.body;
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const data = {
      businessId,
      tenantId,
      businessPhoneNumber,
      transferNumber,
      fallbackNumber,
      aiEnabled,
      recordingEnabled,
      forwardingEnabled,
      businessHours: typeof businessHours === 'object' ? JSON.stringify(businessHours) : businessHours
    };

    let config;
    if (id) {
      config = await prisma.tenantPhoneNumber.update({
        where: { id },
        data
      });
    } else {
      // For Phase 1 MVP, we might need a Twilio number. 
      // If none provided, we use a placeholder or the first available unassigned one.
      // Ideally, the user should provide the twilioPhoneNumber they want to configure.
      data.twilioPhoneNumber = req.body.twilioPhoneNumber || "PENDING";
      config = await prisma.tenantPhoneNumber.create({ data });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.toggleAI = async (req, res) => {
  try {
    const { id } = req.params;
    const config = await prisma.tenantPhoneNumber.findUnique({ where: { id } });
    
    if (!config) return res.status(404).json({ success: false, error: "Not found" });

    const updated = await prisma.tenantPhoneNumber.update({
      where: { id },
      data: { aiEnabled: !config.aiEnabled }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { businessId } = req.query;
    const tenantId = req.user.tenantId;

    const whereClause = req.user.role === "SUPERADMIN"
      ? (businessId ? { businessId } : {})
      : { tenantId };

    // Aggregate stats from CallAnalytics
    const stats = await prisma.callAnalytics.aggregate({
      where: { tenantId: tenantId },
      _sum: {
        incomingCalls: true,
        aiHandledCalls: true,
        transferredCalls: true
      }
    });

    res.json({
      success: true,
      data: {
        incomingCalls: stats._sum.incomingCalls || 0,
        aiHandledCalls: stats._sum.aiHandledCalls || 0,
        transferredCalls: stats._sum.transferredCalls || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
