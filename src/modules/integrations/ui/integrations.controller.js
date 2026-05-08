const prisma = require("../../../config/prisma");
const IntegrationManager = require("../core/IntegrationManager");

/**
 * getStatus
 * Returns the connection status and configuration for all supported integrations.
 */
exports.getStatus = async (req, res) => {
  try {
    const { businessId } = req.query;
    if (!businessId) return res.status(400).json({ success: false, error: "businessId required" });

    const integrations = await prisma.integration.findMany({
      where: { businessId },
      include: { credentials: true }
    });

    const providers = ["TOAST", "SQUARE", "CLOVER"];
    const statusList = providers.map(p => {
      const found = integrations.find(i => i.provider === p);
      return {
        provider: p,
        id: found ? found.id : null,
        isConnected: found ? found.status === "CONNECTED" : false,
        status: found ? found.status : "DISCONNECTED",
        lastSync: found ? found.lastSync : null,
        config: (found && found.config) ? JSON.parse(found.config) : { menuSync: true, orderPush: true, inventorySync: false }
      };
    });

    return res.json({ success: true, data: statusList });
  } catch (err) {
    console.error("[Integrations] Status error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * connect
 * Simulates connecting an integration (or triggers OAuth redirect).
 */
exports.connect = async (req, res) => {
  try {
    const { businessId, provider } = req.body;
    
    // Simulate connection for demo purposes
    let integration = await prisma.integration.findFirst({
      where: { businessId, provider: provider.toUpperCase() }
    });

    if (!integration) {
      integration = await prisma.integration.create({
        data: {
          businessId,
          tenantId: req.tenantId,
          provider: provider.toUpperCase(),
          status: "CONNECTED",
          lastSync: new Date(),
          credentials: {
            create: {
              accessToken: "simulated_token_" + Math.random().toString(36).slice(2),
            }
          }
        }
      });
    } else {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: "CONNECTED", lastSync: new Date() }
      });
    }

    // Trigger initial sync in background
    IntegrationManager.runSync(businessId, provider).catch(console.error);

    return res.json({ success: true, message: `${provider} connected successfully` });
  } catch (err) {
    console.error("[Integrations] Connect error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * getLogs
 * Fetches recent sync logs for a business.
 */
exports.getLogs = async (req, res) => {
  try {
    const { businessId } = req.query;
    
    const logs = await prisma.integrationLog.findMany({
      where: { integration: { businessId } },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return res.json({ success: true, data: logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * getSettings
 * Fetches the configuration and credential metadata for an integration.
 */
exports.getSettings = async (req, res) => {
  try {
    const { businessId, provider } = req.query;
    
    const integration = await prisma.integration.findFirst({
      where: { businessId, provider: provider.toUpperCase() },
      include: { credentials: true }
    });

    if (!integration) return res.status(404).json({ success: false, error: "Integration not found" });

    return res.json({
      success: true,
      data: {
        id: integration.id,
        status: integration.status,
        config: integration.config ? JSON.parse(integration.config) : { menuSync: true, orderPush: true, inventorySync: false },
        credentials: integration.credentials ? {
          accessToken: integration.credentials.accessToken,
          apiKey: integration.credentials.apiKey
        } : null,
        lastSync: integration.lastSync
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * updateSettings
 * Updates the configuration (toggles) for an integration.
 */
exports.updateSettings = async (req, res) => {
  try {
    const { integrationId, config, credentials } = req.body;
    
    const integration = await prisma.integration.update({
      where: { id: integrationId },
      data: { config: JSON.stringify(config) }
    });
    
    if (credentials) {
      await prisma.integrationCredential.upsert({
        where: { integrationId },
        update: { 
          accessToken: credentials.accessToken,
          apiKey: credentials.merchantId // We store merchantId in apiKey for Clover
        },
        create: {
          integrationId,
          accessToken: credentials.accessToken,
          apiKey: credentials.merchantId
        }
      });
    }

    // Trigger sync in background to validate new credentials
    IntegrationManager.runSync(integration.businessId, integration.provider).catch(console.error);

    return res.json({ success: true, message: "Settings and credentials updated successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * disconnect
 * Permanently removes the integration and its credentials.
 */
exports.disconnect = async (req, res) => {
  try {
    const { integrationId } = req.body;
    
    // Cleanup credentials first
    await prisma.integrationCredential.deleteMany({ where: { integrationId } });
    await prisma.integrationLog.deleteMany({ where: { integrationId } });
    await prisma.integration.delete({ where: { id: integrationId } });

    return res.json({ success: true, message: "Integration disconnected" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
