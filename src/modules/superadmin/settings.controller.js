const settingsService = require("../../services/settings.service");
const prisma = require("../../config/prisma");
const fs = require("fs");
const path = require("path");

exports.getAllSettings = async (req, res) => {
  try {
    const configPath = path.join(__dirname, "../../config/platform.json");
    let fileConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch (e) {}
    }

    let dbSettings = {};
    try {
      dbSettings = await settingsService.getSettings();
    } catch (e) {}

    const merged = {
      ...fileConfig,
      resendApiKey: process.env.RESEND_API_KEY || fileConfig.resendApiKey || "",
      ...dbSettings
    };

    res.json({ success: true, data: merged });
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

    // If flat key-value object is sent (e.g. from SMTP / Resend panel or platform settings)
    if (!group && !settings) {
      const superadminController = require("./superadmin.controller");
      return superadminController.updateSettings(req, res);
    }

    if (!group || !settings) {
      return res.status(400).json({ success: false, message: "Group and settings map required" });
    }

    await settingsService.updateSettings(settings, group);
    
    // Create Audit Log (Safely)
    try {
      if (req.user && req.user.id) {
        await prisma.auditLog.create({
          data: {
            userId: req.user.id,
            action: "UPDATE_SYSTEM_SETTINGS",
            resource: group,
            details: settings,
            ipAddress: req.ip
          }
        });
      }
    } catch (auditErr) {}

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
