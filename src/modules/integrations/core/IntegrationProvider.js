/**
 * IntegrationProvider (Abstract Base Class)
 * 
 * All POS adapters must inherit from this class and implement the required methods.
 * This ensures a unified interface for the rest of the application.
 */
class IntegrationProvider {
  constructor(integrationRecord) {
    this.integration = integrationRecord;
    this.businessId = integrationRecord.businessId;
    this.tenantId = integrationRecord.tenantId;
  }

  /**
   * Initialize connection (e.g., refresh tokens, check health)
   */
  async connect() {
    throw new Error("Method 'connect()' must be implemented.");
  }

  /**
   * Pull menu from POS and sync with internal database
   */
  async syncMenu() {
    throw new Error("Method 'syncMenu()' must be implemented.");
  }

  /**
   * Push a new order to the POS
   * @param {Object} orderData Internal order object
   */
  async pushOrder(orderData) {
    throw new Error("Method 'pushOrder()' must be implemented.");
  }

  /**
   * Pull orders from POS (for reconciliation)
   */
  async syncOrders() {
    throw new Error("Method 'syncOrders()' must be implemented.");
  }

  /**
   * Sync inventory levels
   */
  async syncInventory() {
    throw new Error("Method 'syncInventory()' must be implemented.");
  }

  /**
   * Normalize POS-specific webhook data into internal format
   * @param {Object} webhookData Raw payload from POS
   */
  async handleWebhook(webhookData) {
    throw new Error("Method 'handleWebhook()' must be implemented.");
  }

  // --- Helper Methods ---

  async log(level, action, message, details = null) {
    const prisma = require("../../../config/prisma");
    
    console.log(`[Integration:${this.integration.provider}] ${action}: ${message}`);
    
    try {
      await prisma.integrationLog.create({
        data: {
          integrationId: this.integration.id,
          level,
          action,
          message,
          details: details ? JSON.stringify(details) : null
        }
      });
    } catch (err) {
      console.error("[IntegrationLog Error]", err.message);
    }
  }
}

module.exports = IntegrationProvider;
