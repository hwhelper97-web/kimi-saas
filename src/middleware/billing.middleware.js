const prisma = require("../config/prisma");
const { PLANS, hasFeature } = require("../constants/plans");

/**
 * 💳 BILLING & SUBSCRIPTION ENFORCEMENT MIDDLEWARE
 * This middleware ensures tenants are within their limits and have active subscriptions.
 */
const billingGuard = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (req.user?.role === "SUPERADMIN") return next();
    if (!tenantId) return res.status(401).json({ success: false, message: "Tenant context missing" });

    const billingService = require("../services/billing.service");
    await billingService.checkAndResetUsage(tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        plan: true,
        subscriptionStatus: true,
        trialEndDate: true,
        subscriptionEndDate: true,
        usedMinutes: true,
        monthlyLimit: true,
        monthlyUsedTokens: true,
        monthlyTokenLimit: true,
        staffLimit: true,
        businessLimit: true,
        isDemoAccount: true
      }
    });

    if (!tenant) {
      return res.status(403).json({ success: false, message: "Tenant record not found in system.", code: "TENANT_NOT_FOUND" });
    }

    // 🚀 Demo accounts bypass billing restrictions
    if (tenant.isDemoAccount) return next();

    // 1. Check for Hard Suspension or Expiration
    if (tenant.subscriptionStatus === "SUSPENDED" || tenant.subscriptionStatus === "EXPIRED") {
      return res.status(403).json({ 
        success: false, 
        message: `Your account is ${tenant.subscriptionStatus.toLowerCase()}. Please contact support.`,
        code: `ACCOUNT_${tenant.subscriptionStatus}`
      });
    }

    // 2. Check for Expiration (Trial or Subscription)
    const now = new Date();
    const isTrialExpired = tenant.trialEndDate && tenant.trialEndDate < now;
    const isSubExpired = tenant.subscriptionEndDate && tenant.subscriptionEndDate < now;
    
    // If expired and not in an active status (like currently paying), block access
    if ((isTrialExpired || isSubExpired) && tenant.subscriptionStatus !== "ACTIVE") {
      return res.status(403).json({ 
        success: false, 
        message: "Your subscription has expired. Please upgrade to continue.",
        code: "SUBSCRIPTION_EXPIRED",
        expiredAt: isTrialExpired ? tenant.trialEndDate : tenant.subscriptionEndDate
      });
    }

    // 3. Attach tenant info for downstream use
    req.tenant = tenant;
    next();
  } catch (error) {
    console.error("[BILLING_GUARD] Error:", error);
    next(); // Fail open for safety in MVP, but log the error
  }
};

/**
 * 🏗️ RESOURCE LIMIT CHECKER
 * Use this to restrict creation of entities (Businesses, Staff, etc)
 */
const checkResourceLimit = (resourceType) => {
  return async (req, res, next) => {
    try {
      if (req.user?.role === "SUPERADMIN") return next();
      const tenant = req.tenant; // From billingGuard
      if (!tenant) {
        return res.status(403).json({ success: false, message: "Tenant context missing" });
      }
      const plan = PLANS[tenant.plan.toUpperCase()] || PLANS.NEXA_CORE;
      
      let currentCount = 0;
      let limit = 0;

      if (resourceType === 'BUSINESS') {
        currentCount = await prisma.business.count({ where: { tenantId: tenant.id } });
        limit = tenant.businessLimit || plan.maxBusinesses;
      } else if (resourceType === 'STAFF') {
        currentCount = await prisma.user.count({ where: { tenantId: tenant.id } });
        limit = tenant.staffLimit || plan.maxStaff;
      }

      if (currentCount >= limit) {
        return res.status(403).json({
          success: false,
          message: `Limit reached for ${resourceType}. Your current plan (${plan.name}) allows up to ${limit}.`,
          code: "LIMIT_REACHED"
        });
      }

      next();
    } catch (error) {
      next();
    }
  };
};

/**
 * 🧩 FEATURE GATE
 * Use this to restrict access to specific features (e.g. Analytics, Integrations)
 */
const requireFeature = (featureKey) => {
  return (req, res, next) => {
    if (req.user?.role === "SUPERADMIN") return next();
    const tenant = req.tenant; // From billingGuard
    if (!tenant) {
      return res.status(403).json({ success: false, message: "Tenant context missing" });
    }
    if (!hasFeature(tenant.plan, featureKey)) {
      return res.status(403).json({
        success: false,
        message: `This feature is not available on your current plan.`,
        code: "FEATURE_LOCKED"
      });
    }
    next();
  };
};

module.exports = { billingGuard, checkResourceLimit, requireFeature };
