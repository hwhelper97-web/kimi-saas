const prisma = require("../config/prisma");
const fs = require("fs");
const path = require("path");

class SettingsService {
  /**
   * Get all platform settings, optionally filtered by group
   */
  async getSettings(group = null) {
    const where = group ? { group } : {};
    const settings = await prisma.systemSetting.findMany({
      where,
    });

    // Convert array of models to a clean key-value object
    const result = {};
    settings.forEach((s) => {
      let value = s.value;
      if (s.type === "number") value = parseFloat(value);
      if (s.type === "boolean") value = value === "true";
      if (s.type === "json") {
        try {
          value = JSON.parse(value);
        } catch (e) {
          value = {};
        }
      }
      result[s.key] = value;
    });

    // Sync with platform.json for legacy fields if getting all or GENERAL
    if (!group || group === "GENERAL") {
      const legacyConfig = this.getLegacyConfig();
      // Ensure platformName is aliased from projectName for the UI
      if (legacyConfig.projectName && !legacyConfig.platformName) {
        legacyConfig.platformName = legacyConfig.projectName;
      }
      return { ...result, ...legacyConfig };
    }

    return result;
  }

  /**
   * Update multiple settings at once
   */
  async updateSettings(settingsMap, group) {
    const updates = [];
    for (const [key, value] of Object.entries(settingsMap)) {
      let type = "string";
      let valStr = String(value);

      if (typeof value === "number") type = "number";
      if (typeof value === "boolean") {
        type = "boolean";
        valStr = value ? "true" : "false";
      }
      if (typeof value === "object") {
        type = "json";
        valStr = JSON.stringify(value);
      }

      updates.push(
        prisma.systemSetting.upsert({
          where: { key },
          update: { value: valStr, group, type, updatedAt: new Date() },
          create: { key, value: valStr, group, type },
        })
      );
    }

    await Promise.all(updates);

    // Sync specific legacy fields back to platform.json if needed
    this.syncLegacyFields(settingsMap);

    return true;
  }

  /**
   * Internal helper to read legacy platform.json
   */
  getLegacyConfig() {
    try {
      const configPath = path.join(__dirname, "../config/platform.json");
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
      }
    } catch (e) {
      console.error("Error reading legacy config:", e);
    }
    return {};
  }

  /**
   * Sync key fields back to platform.json to ensure existing logic doesn't break
   */
  syncLegacyFields(settingsMap) {
    try {
      const legacyKeys = ["projectName", "logoUrl", "voice", "speed", "responseDelay", "twilioSid", "twilioToken", "openaiKey"];
      const toSync = {};
      
      let hasLegacy = false;
      legacyKeys.forEach(key => {
        if (settingsMap[key] !== undefined) {
          toSync[key] = settingsMap[key];
          hasLegacy = true;
        }
      });

      // Special handling for platformName alias
      if (settingsMap['platformName'] !== undefined) {
        toSync['projectName'] = settingsMap['platformName'];
        hasLegacy = true;
      }

      if (hasLegacy) {
        const configPath = path.join(__dirname, "../config/platform.json");
        let config = this.getLegacyConfig();
        config = { ...config, ...toSync };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
    } catch (e) {
      console.error("Error syncing legacy config:", e);
    }
  }
}

module.exports = new SettingsService();
