const settingsService = require("../../services/settings.service");
const prisma = require("../../config/prisma");

exports.getAllSettings = async (req, res) => {
  try {
    const settings = await settingsService.getSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ success: false, message: "Failed to load settings" });
  }
};

exports.getSettingsByGroup = async (req, res) => {
  try {
    const { group } = req.params;
    const settings = await settingsService.getSettings(group);
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error(`Get ${req.params.group} settings error:`, error);
    res.status(500).json({ success: false, message: "Failed to load settings group" });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { group, settings } = req.body;
    if (!group || !settings) {
      return res.status(400).json({ success: false, message: "Group and settings map required" });
    }

    await settingsService.updateSettings(settings, group);
    
    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "UPDATE_SYSTEM_SETTINGS",
        resource: group,
        details: settings,
        ipAddress: req.ip
      }
    });

    res.json({ success: true, message: "Settings updated successfully" });
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({ success: false, message: "Failed to update settings" });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch audit logs" });
  }
};
