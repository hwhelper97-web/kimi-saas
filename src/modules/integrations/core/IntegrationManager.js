const prisma = require("../../../config/prisma");

class IntegrationManager {
  static providers = {};

  /**
   * Register a provider adapter (e.g., Toast, Square)
   */
  static registerProvider(name, adapterClass) {
    this.providers[name.toUpperCase()] = adapterClass;
    console.log(`[IntegrationManager] Registered provider: ${name}`);
  }

  /**
   * Get an instance of the provider adapter for a specific business
   */
  static async getProviderInstance(businessId, providerType) {
    const integration = await prisma.integration.findFirst({
      where: { businessId, provider: providerType.toUpperCase() },
      include: { credentials: true }
    });

    if (!integration) return null;

    const AdapterClass = this.providers[providerType.toUpperCase()];
    if (!AdapterClass) {
      throw new Error(`Integration provider '${providerType}' is not registered.`);
    }

    return new AdapterClass(integration);
  }

  /**
   * Run a sync job for a specific business
   */
  static async runSync(businessId, providerType) {
    try {
      const adapter = await this.getProviderInstance(businessId, providerType);
      if (!adapter) return;

      console.log(`[IntegrationManager] Starting sync for ${providerType} (Business: ${businessId})`);
      
      await adapter.connect();
      await adapter.syncMenu();
      await adapter.syncInventory();
      
      await prisma.integration.update({
        where: { id: adapter.integration.id },
        data: { lastSync: new Date(), status: "CONNECTED" }
      });

    } catch (error) {
      console.error(`[IntegrationManager] Sync failed for ${providerType}:`, error.message);
      // Update status to error if needed
    }
  }
}

module.exports = IntegrationManager;
