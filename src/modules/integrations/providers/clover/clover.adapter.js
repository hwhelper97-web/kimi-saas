const IntegrationProvider = require("../../core/IntegrationProvider");
const prisma = require("../../../../config/prisma");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class CloverAdapter extends IntegrationProvider {
  constructor(integrationRecord) {
    super(integrationRecord);
    // Determine if we should use Sandbox or Production based on environment or credentials
    const isSandbox = this.credentials?.isSandbox || false;
    this.baseUrl = isSandbox 
      ? "https://sandbox.dev.clover.com/v3" 
      : "https://api.clover.com/v3";
    
    this.merchantId = this.credentials?.merchantId;
    this.accessToken = this.credentials?.accessToken;
  }

  async connect() {
    if (!this.merchantId || !this.accessToken) {
      throw new Error("Missing Clover Merchant ID or Access Token");
    }
    
    try {
      const res = await fetch(`${this.baseUrl}/merchants/${this.merchantId}`, {
        headers: { "Authorization": `Bearer ${this.accessToken}` }
      });
      
      if (!res.ok) throw new Error(`Clover connection failed: ${res.statusText}`);
      
      await this.log("INFO", "CONNECT", "Successfully authenticated with Clover Merchant API");
      return true;
    } catch (err) {
      await this.log("ERROR", "CONNECT", `Authentication failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * SYNC MENU FROM CLOVER
   * Fetches categories and items from Clover and maps them to Kimi
   */
  async syncMenu() {
    try {
      await this.log("INFO", "SYNC_MENU", "Starting Clover menu synchronization...");

      // 1. Fetch Categories
      const catRes = await fetch(`${this.baseUrl}/merchants/${this.merchantId}/categories?expand=items`, {
        headers: { "Authorization": `Bearer ${this.accessToken}` }
      });
      const catData = await catRes.json();
      
      if (!catData.elements) {
        await this.log("WARNING", "SYNC_MENU", "No categories found in Clover");
        return;
      }

      for (const cloverCat of catData.elements) {
        // Find or create local category
        let localCat = await prisma.menuCategory.findFirst({
          where: { name: cloverCat.name, businessId: this.businessId }
        });

        if (!localCat) {
          localCat = await prisma.menuCategory.create({
            data: {
              name: cloverCat.name,
              businessId: this.businessId,
              tenantId: this.tenantId
            }
          });
        }

        // 2. Process Items in this category
        if (cloverCat.items && cloverCat.items.elements) {
          for (const cloverItem of cloverCat.items.elements) {
            // Find external mapping
            const mapping = await prisma.externalMapping.findFirst({
              where: { externalId: cloverItem.id, provider: "CLOVER", entityType: "MENU_ITEM" }
            });

            const price = (cloverItem.price || 0) / 100; // Clover stores in cents

            if (mapping) {
              await prisma.menuItem.update({
                where: { id: mapping.internalId },
                data: { 
                  name: cloverItem.name, 
                  price: price,
                  categoryId: localCat.id
                }
              });
            } else {
              const newItem = await prisma.menuItem.create({
                data: {
                  name: cloverItem.name,
                  price: price,
                  businessId: this.businessId,
                  tenantId: this.tenantId,
                  categoryId: localCat.id
                }
              });

              await prisma.externalMapping.create({
                data: {
                  internalId: newItem.id,
                  externalId: cloverItem.id,
                  entityType: "MENU_ITEM",
                  provider: "CLOVER",
                  tenantId: this.tenantId
                }
              });
            }
          }
        }
      }

      await this.log("INFO", "SYNC_MENU", `Successfully synced Clover menu for merchant ${this.merchantId}`);
    } catch (error) {
      await this.log("ERROR", "SYNC_MENU", `Sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * PUSH ORDER TO CLOVER
   * Creates a pending order in the Clover POS
   */
  async pushOrder(orderData) {
    try {
      await this.log("INFO", "PUSH_ORDER", `Injecting Order #${orderData.id} into Clover POS...`);

      // 1. Create Order Skeleton
      const orderRes = await fetch(`${this.baseUrl}/merchants/${this.merchantId}/orders`, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          state: "OPEN",
          title: `AI Order - ${orderData.customerName || 'Voice'}`
        })
      });
      const cloverOrder = await orderRes.json();

      if (!cloverOrder.id) throw new Error("Failed to create order skeleton in Clover");

      // 2. Add Line Items
      for (const item of orderData.items) {
        // Find the external ID for this menu item
        const mapping = await prisma.externalMapping.findFirst({
          where: { internalId: item.menuItemId, provider: "CLOVER" }
        });

        if (mapping) {
          await fetch(`${this.baseUrl}/merchants/${this.merchantId}/orders/${cloverOrder.id}/line_items`, {
            method: "POST",
            headers: { 
              "Authorization": `Bearer ${this.accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              item: { id: mapping.externalId }
            })
          });
        }
      }

      await this.log("INFO", "PUSH_ORDER", `Order successfully injected. Clover ID: ${cloverOrder.id}`);
      return { success: true, externalId: cloverOrder.id };
    } catch (error) {
      await this.log("ERROR", "PUSH_ORDER", `Order injection failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async syncInventory() {
    // Optional: Clover doesn't always provide simple inventory sync in one go
  }
}

module.exports = CloverAdapter;
