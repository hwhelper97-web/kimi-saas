const prisma = require("../config/prisma");
const { PLANS } = require("../constants/plans");

class BillingService {
  /**
   * 🔄 Check and Reset Monthly Usage if needed
   */
  async checkAndResetUsage(tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, lastBillingReset: true, billingCycleDay: true }
    });

    if (!tenant) return;

    const now = new Date();
    const lastReset = new Date(tenant.lastBillingReset);
    
    // Check if we are in a new month relative to the last reset
    const monthsDiff = (now.getFullYear() - lastReset.getFullYear()) * 12 + (now.getMonth() - lastReset.getMonth());
    
    if (monthsDiff >= 1 && now.getDate() >= tenant.billingCycleDay) {
      console.log(`[BILLING] Resetting usage for tenant ${tenantId}`);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          usedMinutes: 0,
          monthlyUsedTokens: 0,
          lastBillingReset: now
        }
      });
    }
  }

  /**
   * 📉 Check if a tenant has exceeded their monthly AI minute limit or token limit
   */
  async canMakeCall(tenantId) {
    // First, ensure usage is up to date
    await this.checkAndResetUsage(tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { 
        usedMinutes: true, 
        monthlyLimit: true, 
        plan: true, 
        subscriptionStatus: true, 
        trialEndDate: true, 
        subscriptionEndDate: true,
        monthlyUsedTokens: true,
        monthlyTokenLimit: true,
        isDemoAccount: true
      }
    });

    if (!tenant) return { allowed: false, message: "Tenant not found" };

    // 🚀 Demo accounts bypass usage and expiration checks
    if (tenant.isDemoAccount) return { allowed: true, tenant };

    // 1. Check Status
    if (tenant.subscriptionStatus === "SUSPENDED" || tenant.subscriptionStatus === "EXPIRED") {
      return { allowed: false, message: `Account ${tenant.subscriptionStatus.toLowerCase()}` };
    }

    // 2. Check Expiration
    const now = new Date();
    if (tenant.trialEndDate && tenant.trialEndDate < now && tenant.subscriptionStatus !== "ACTIVE") {
      return { allowed: false, message: "Trial expired" };
    }
    if (tenant.subscriptionEndDate && tenant.subscriptionEndDate < now && tenant.subscriptionStatus !== "ACTIVE") {
      return { allowed: false, message: "Subscription expired" };
    }

    // 3. Check Minutes Usage
    const plan = PLANS[tenant.plan.toUpperCase()] || PLANS.NEXA_CORE;
    const minuteLimit = tenant.monthlyLimit || plan.monthlyMinutes;

    if (tenant.usedMinutes >= minuteLimit) {
      return { 
        allowed: false, 
        message: "Monthly call limit reached",
        limit: minuteLimit,
        used: tenant.usedMinutes
      };
    }

    // 4. Check Token Usage (Safety gate for high-cost AI features)
    const tokenLimit = tenant.monthlyTokenLimit || plan.monthlyTokens;
    if (tenant.monthlyUsedTokens >= tokenLimit) {
        return {
            allowed: false,
            message: "Monthly AI token limit reached",
            limit: tokenLimit,
            used: tenant.monthlyUsedTokens
        };
    }

    return { allowed: true, tenant };
  }

  /**
   * 📈 Record call duration and update tenant usage
   */
  async recordCallUsage(tenantId, durationSeconds) {
    const minutes = Math.ceil(durationSeconds / 60);
    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        usedMinutes: { increment: minutes }
      }
    });
  }

  /**
   * 🪙 Record OpenAI/Realtime token usage
   */
  async recordTokenUsage(tenantId, tokens) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        monthlyUsedTokens: { increment: tokens },
        totalUsedTokens: { increment: tokens },
        tokenBalance: { decrement: Math.ceil(tokens / 1000) } // Example: 1 credit per 1k tokens
      }
    });
  }

  /**
   * 🪙 Check if tenant has enough credits for advanced AI features
   */
  async hasTokens(tenantId, requiredTokens) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tokenBalance: true, monthlyUsedTokens: true, monthlyTokenLimit: true, plan: true }
    });
    
    if (!tenant) return false;
    
    const plan = PLANS[tenant.plan.toUpperCase()] || PLANS.NEXA_CORE;
    const limit = tenant.monthlyTokenLimit || plan.monthlyTokens;
    
    // Check both credit balance and monthly limit
    return tenant.tokenBalance >= 1 && tenant.monthlyUsedTokens < limit;
  }
}

module.exports = new BillingService();
