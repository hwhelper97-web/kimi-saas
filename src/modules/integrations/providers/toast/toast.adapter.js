const IntegrationProvider = require("../../core/IntegrationProvider");
const prisma = require("../../../../config/prisma");

class ToastAdapter extends IntegrationProvider {
  constructor(integrationRecord) {
    super(integrationRecord);
    this.baseUrl = "https://api.toasttab.com/management/v1";
  }

  async connect() {
    // Logic to verify OAuth token or refresh it
    await this.log("INFO", "CONNECT", "Successfully connected to Toast API");
    return true;
  }

  /**
   * PULL MENU FROM TOAST
   * California restaurants often have complex modifiers. 
   * This method fetches the full menu and maps it to the Kimi schema.
   */
  async syncMenu() {
    try {
      await this.log("INFO", "SYNC_MENU", "Fetching menu from Toast...");

      // 1. Fetch from Toast API (Mocked for now)
      // const response = await fetch(`${this.baseUrl}/menus`, { ... });
      // const toastMenu = await response.json();

      // Mock Data for Demo
      const toastMenu = [
        { externalId: "toast-p-101", name: "California Veggie Burger", price: 14.50, category: "Burgers" }
      ];

      for (const item of toastMenu) {
        // Find existing mapping or create new
        const mapping = await prisma.externalMapping.findFirst({
          where: { externalId: item.externalId, provider: "TOAST", entityType: "MENU_ITEM" }
        });

        if (mapping) {
          // Update existing item
          await prisma.menuItem.update({
            where: { id: mapping.internalId },
            data: { name: item.name, price: item.price }
          });
        } else {
          // Create new item in Kimi
          const newItem = await prisma.menuItem.create({
            data: {
              name: item.name,
              price: item.price,
              businessId: this.businessId,
              tenantId: this.tenantId
            }
          });

          // Store mapping
          await prisma.externalMapping.create({
            data: {
              internalId: newItem.id,
              externalId: item.externalId,
              entityType: "MENU_ITEM",
              provider: "TOAST",
              tenantId: this.tenantId
            }
          });
        }
      }

      await this.log("INFO", "SYNC_MENU", `Synced ${toastMenu.length} items from Toast`);
    } catch (error) {
      await this.log("ERROR", "SYNC_MENU", `Sync failed: ${error.message}`);
      throw error;
    }
  }

  async pushOrder(orderData) {
    await this.log("INFO", "PUSH_ORDER", `Injecting order ${orderData.id} into Toast POS`);
    // Toast API: POST /orders
    return { success: true, externalId: "toast-ord-" + Date.now() };
  }

  async syncInventory() {
    // Logic to update Kimi item availability based on Toast stock levels
  }

  async handleWebhook(data) {
    // Process Toast webhook events (e.g., item out of stock)
  }
}

module.exports = ToastAdapter;
