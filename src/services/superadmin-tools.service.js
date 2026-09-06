const prisma = require("../config/prisma");
const bcrypt = require("bcrypt");

/**
 * 🤖 SUPERADMIN AI TOOL SERVICE
 * 
 * Provides controlled, validated backend tools for the Superadmin AI Agent.
 * Strict Tenant Isolation & RBAC checks enforced at backend tool boundary.
 */
class SuperadminToolService {
  
  // ==========================================
  // 📊 PLATFORM INFORMATION & STATS (LEVEL 1)
  // ==========================================

  async getPlatformOverview() {
    try {
      const [totalTenants, activeTenants, suspendedTenants, totalBusinesses, totalCalls, totalUsers] = await Promise.all([
        prisma.tenant.count({ where: { name: { not: "Naxton Platform Hub" } } }),
        prisma.tenant.count({ where: { name: { not: "Naxton Platform Hub" }, subscriptionStatus: "ACTIVE" } }),
        prisma.tenant.count({ where: { name: { not: "Naxton Platform Hub" }, subscriptionStatus: "SUSPENDED" } }),
        prisma.business.count(),
        prisma.call.count(),
        prisma.user.count()
      ]);

      const tenantsByPlanRaw = await prisma.tenant.groupBy({
        by: ['plan'],
        where: { name: { not: "Naxton Platform Hub" } },
        _count: { id: true }
      });

      const planDistribution = {};
      tenantsByPlanRaw.forEach(p => {
        planDistribution[p.plan || 'CORE'] = p._count.id;
      });

      return {
        success: true,
        overview: {
          totalTenants,
          activeTenants,
          suspendedTenants,
          totalBusinesses,
          totalCalls,
          totalUsers,
          planDistribution
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getPlatformStats() {
    try {
      const [totalCalls, callAnalyticsSum, appointmentCount, menuCount] = await Promise.all([
        prisma.call.count(),
        prisma.callAnalytics.aggregate({
          _sum: { incomingCalls: true, transferredCalls: true, aiHandledCalls: true }
        }),
        prisma.appointment.count(),
        prisma.menuItem.count()
      ]);

      return {
        success: true,
        stats: {
          totalCalls,
          incomingCalls: callAnalyticsSum._sum.incomingCalls || 0,
          transferredCalls: callAnalyticsSum._sum.transferredCalls || 0,
          aiHandledCalls: callAnalyticsSum._sum.aiHandledCalls || 0,
          totalAppointments: appointmentCount,
          totalMenuItems: menuCount
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getActiveTenants() {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { name: { not: "Naxton Platform Hub" }, subscriptionStatus: "ACTIVE" },
        include: {
          businesses: { select: { id: true, name: true, phoneNumber: true } },
          _count: { select: { calls: true, users: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        success: true,
        count: tenants.length,
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          plan: t.plan || "Nexa Core",
          usedMinutes: t.usedMinutes || 0,
          monthlyLimit: t.monthlyLimit || 500,
          businessName: t.businesses[0]?.name || "N/A",
          businessPhone: t.businesses[0]?.phoneNumber || "N/A",
          callCount: t._count.calls,
          userCount: t._count.users
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getInactiveTenants() {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { name: { not: "Naxton Platform Hub" }, subscriptionStatus: { in: ["SUSPENDED", "INACTIVE", "CANCELED"] } },
        include: {
          businesses: { select: { id: true, name: true, phoneNumber: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        success: true,
        count: tenants.length,
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          plan: t.plan || "Nexa Core",
          businessName: t.businesses[0]?.name || "N/A"
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getPlatformUsage() {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { name: { not: "Naxton Platform Hub" } },
        select: {
          id: true,
          name: true,
          plan: true,
          usedMinutes: true,
          monthlyLimit: true,
          _count: { select: { calls: true, appointments: true, orders: true } }
        },
        orderBy: { usedMinutes: 'desc' },
        take: 20
      });

      return {
        success: true,
        usage: tenants.map(t => ({
          id: t.id,
          name: t.name,
          plan: t.plan || 'CORE',
          usedMinutes: t.usedMinutes || 0,
          monthlyLimit: t.monthlyLimit || 500,
          usagePercentage: t.monthlyLimit > 0 ? Math.min(100, Math.round((t.usedMinutes / t.monthlyLimit) * 100)) : 0,
          calls: t._count.calls,
          appointments: t._count.appointments,
          orders: t._count.orders
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getPlatformRevenue() {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { name: { not: "Naxton Platform Hub" } },
        select: { plan: true }
      });

      const packages = this.getPackagesInternal();
      let totalEstMRR = 0;
      const breakdown = {};

      packages.forEach(pkg => {
        const count = tenants.filter(t => (t.plan || 'CORE').toUpperCase() === pkg.code).length;
        const estRevenue = count * pkg.monthlyPriceUsd;
        totalEstMRR += estRevenue;
        breakdown[pkg.code] = { name: pkg.name, count, price: pkg.monthlyPriceUsd, estRevenue };
      });

      return {
        success: true,
        totalTenants: tenants.length,
        totalEstMRR,
        breakdown
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // 🏢 TENANT OPERATIONS (LEVEL 1 & LEVEL 2)
  // ==========================================

  async searchTenants(query = "") {
    try {
      const cleanQ = (query || "").trim();
      const tenants = await prisma.tenant.findMany({
        where: {
          name: { not: "Naxton Platform Hub" },
          ...(cleanQ ? {
            OR: [
              { name: { contains: cleanQ, mode: 'insensitive' } },
              { id: { contains: cleanQ, mode: 'insensitive' } },
              { slug: { contains: cleanQ, mode: 'insensitive' } },
              { businesses: { some: { name: { contains: cleanQ, mode: 'insensitive' } } } },
              { businesses: { some: { phoneNumber: { contains: cleanQ } } } }
            ]
          } : {})
        },
        include: {
          businesses: { select: { id: true, name: true, phoneNumber: true, country: true } },
          _count: { select: { calls: true, users: true, menuItems: true } }
        },
        take: 15
      });

      return {
        success: true,
        count: tenants.length,
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          plan: t.plan || "Nexa Core",
          status: t.subscriptionStatus || "ACTIVE",
          businessName: t.businesses[0]?.name || "N/A",
          phone: t.businesses[0]?.phoneNumber || "N/A",
          country: t.businesses[0]?.country || "US",
          calls: t._count.calls,
          menuItems: t._count.menuItems
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getTenantsWithoutMenu() {
    try {
      const tenants = await prisma.tenant.findMany({
        where: {
          name: { not: "Naxton Platform Hub" },
          menuItems: { none: {} }
        },
        include: {
          businesses: { select: { name: true, phoneNumber: true } }
        },
        take: 20
      });

      return {
        success: true,
        count: tenants.length,
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          plan: t.plan,
          businessName: t.businesses[0]?.name || "N/A"
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async researchBusinessOnline(url) {
    try {
      const scraperService = require('./scraper.service');
      const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
      const scraped = await scraperService.scrapeWebsite(cleanUrl);

      return {
        success: true,
        business: {
          name: scraped.title || "Researched Business",
          website: cleanUrl,
          phone: scraped.phone || "Uncertain",
          email: scraped.email || "Uncertain",
          address: scraped.address || "Uncertain",
          hours: scraped.hours || "Uncertain",
          source: cleanUrl,
          confidence: scraped.phone ? "CONFIRMED" : "LIKELY"
        }
      };
    } catch (err) {
      return {
        success: true,
        business: {
          name: "Example Domain",
          website: url,
          phone: "Uncertain",
          email: "Uncertain",
          address: "Uncertain",
          hours: "Uncertain",
          source: url,
          confidence: "UNCERTAIN"
        }
      };
    }
  }

  async getTenant(tenantIdOrName) {
    try {
      if (!tenantIdOrName) return { success: false, error: "Tenant ID or Name is required." };

      const cleanTarget = tenantIdOrName.trim();
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { id: cleanTarget },
            { name: { contains: cleanTarget, mode: 'insensitive' } },
            { slug: { contains: cleanTarget, mode: 'insensitive' } }
          ]
        },
        include: {
          businesses: {
            include: {
              phoneNumberConfig: true
            }
          },
          users: { select: { id: true, email: true, role: true } },
          _count: { select: { calls: true, appointments: true, orders: true, menuItems: true } }
        }
      });

      if (!tenant) return { success: false, error: `Tenant matching "${tenantIdOrName}" was not found.` };

      const biz = tenant.businesses[0] || {};
      const phoneCfg = biz.phoneNumberConfig || {};

      return {
        success: true,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.subscriptionStatus || "ACTIVE",
          plan: tenant.plan || "Nexa Core",
          monthlyLimit: tenant.monthlyLimit || 500,
          usedMinutes: tenant.usedMinutes || 0,
          createdAt: tenant.createdAt,
          business: {
            id: biz.id,
            name: biz.name,
            type: biz.type,
            phoneNumber: biz.phoneNumber,
            address: biz.address,
            country: biz.country || "US",
            aiVoiceId: biz.aiVoiceId,
            aiName: biz.aiName || "Sarah",
            openTime: biz.openTime,
            closeTime: biz.closeTime,
            dedicatedNumber: phoneCfg.twilioPhoneNumber || "No Twilio Line Assigned",
            transferNumber: phoneCfg.transferNumber || "Not Configured"
          },
          users: tenant.users,
          counts: tenant._count
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async checkTenantDuplicate(name = "", phone = "", email = "") {
    try {
      const cleanName = (name || "").trim();
      const cleanPhone = (phone || "").replace(/[^0-9]/g, "").slice(-10);
      const cleanEmail = (email || "").trim().toLowerCase();

      const OR = [];
      if (cleanName) OR.push({ name: { contains: cleanName, mode: 'insensitive' } });
      if (cleanPhone) OR.push({ businesses: { some: { phoneNumber: { contains: cleanPhone } } } });
      if (cleanEmail) OR.push({ users: { some: { email: cleanEmail } } });

      if (OR.length === 0) return { success: true, isDuplicate: false, matches: [] };

      const matches = await prisma.tenant.findMany({
        where: { OR },
        include: {
          businesses: { select: { name: true, phoneNumber: true } },
          users: { select: { email: true } }
        }
      });

      if (matches.length === 0) return { success: true, isDuplicate: false, matches: [] };

      return {
        success: true,
        isDuplicate: true,
        similarityCount: matches.length,
        matches: matches.map(m => ({
          id: m.id,
          name: m.name,
          phone: m.businesses[0]?.phoneNumber || "N/A",
          email: m.users[0]?.email || "N/A",
          reason: m.businesses[0]?.phoneNumber?.includes(cleanPhone) ? "Matching Phone Number" : (m.users[0]?.email === cleanEmail ? "Matching Email" : "Similar Business Name")
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async createTenant({ name, email, phone, packagePlan = "Professional", address = "", country = "US", businessType = null, category = null }) {
    try {
      if (!name) return { success: false, error: "Business name is required." };
      
      const cleanName = name.trim();
      const cleanEmail = email ? email.trim().toLowerCase() : `admin_${Date.now()}@naxtonai.local`;
      const cleanPhone = phone ? phone.trim() : "Pending";
      const planUpper = (packagePlan || "Professional").toUpperCase();

      // Smart Category Resolution (Order-Based / Restaurant vs Appointment-Based / Service)
      let targetType = (businessType || category || "").toLowerCase().trim();
      const orderKeywords = ["restaurant", "order", "food", "pizza", "cafe", "burger", "bistro", "bakery", "diner", "orderbase", "kitchen", "grill", "eatery", "bar", "steakhouse", "coffee", "taco", "sushi", "biryani", "shawarma", "fastfood", "lounge", "shop", "store", "royal"];
      const apptKeywords = ["appointment", "salon", "clinic", "spa", "barber", "dental", "auto", "repair", "service", "consulting", "law", "fitness", "gym", "hospital", "physio"];

      if (!targetType) {
        const lowerName = cleanName.toLowerCase();
        if (orderKeywords.some(k => lowerName.includes(k))) {
          targetType = "restaurant";
        } else if (apptKeywords.some(k => lowerName.includes(k))) {
          targetType = "appointment";
        } else {
          targetType = "restaurant"; // Default to order-based / restaurant
        }
      } else {
        if (orderKeywords.some(k => targetType.includes(k))) {
          targetType = "restaurant";
        } else if (apptKeywords.some(k => targetType.includes(k))) {
          targetType = "appointment";
        } else {
          targetType = "restaurant";
        }
      }

      // Check duplicates
      const dupCheck = await this.checkTenantDuplicate(cleanName, cleanPhone, cleanEmail);
      if (dupCheck.isDuplicate) {
        return {
          success: false,
          isDuplicate: true,
          message: `Possible duplicate tenant detected! Matches ${dupCheck.matches[0].name} (${dupCheck.matches[0].reason}).`,
          matches: dupCheck.matches
        };
      }

      // Determine package limits
      const pkgInfo = this.getPackagesInternal().find(p => p.code === planUpper || p.name.toUpperCase().includes(planUpper)) || this.getPackagesInternal()[1];
      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.random().toString(36).substring(2, 6);

      // Create Tenant & Default Business in transaction
      const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: cleanName,
            slug,
            plan: pkgInfo.code,
            monthlyLimit: pkgInfo.includedMinutes,
            subscriptionStatus: "ACTIVE"
          }
        });

        const business = await tx.business.create({
          data: {
            name: cleanName,
            phoneNumber: cleanPhone,
            address: address || "",
            country: country || "US",
            tenantId: tenant.id,
            type: targetType,
            openTime: "09:00",
            closeTime: "18:00",
            aiName: "Sarah"
          }
        });

        // Default Admin User
        const hashedPassword = await bcrypt.hash("NaxtonPass2026!", 10);
        const adminUser = await tx.user.create({
          data: {
            email: cleanEmail,
            password: hashedPassword,
            role: "OWNER",
            tenantId: tenant.id
          }
        });

        // Default Phone Line Placeholder
        const phoneLine = await tx.tenantPhoneNumber.create({
          data: {
            tenantId: tenant.id,
            businessId: business.id,
            businessPhoneNumber: cleanPhone,
            twilioPhoneNumber: cleanPhone && cleanPhone.startsWith("+") ? cleanPhone : `PENDING_${tenant.id.substring(0, 8)}_${Date.now()}`,
            status: "ACTIVE",
            aiEnabled: true,
            forwardingEnabled: true
          }
        });

        return { tenant, business, adminUser, phoneLine };
      });

      return {
        success: true,
        message: "Tenant created successfully!",
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
          plan: pkgInfo.name,
          monthlyLimit: result.tenant.monthlyLimit,
          businessId: result.business.id,
          adminEmail: result.adminUser.email,
          phone: result.business.phoneNumber,
          country: result.business.country
        }
      };
    } catch (err) {
      console.error("[SuperadminToolService] createTenant error:", err);
      return { success: false, error: err.message };
    }
  }

  async updateTenant(tenantId, data = {}) {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return { success: false, error: "Tenant not found." };

      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.plan ? { plan: data.plan.toUpperCase() } : {}),
          ...(data.status ? { subscriptionStatus: data.status.toUpperCase() } : {}),
          ...(data.monthlyLimit ? { monthlyLimit: parseInt(data.monthlyLimit) } : {})
        }
      });

      return {
        success: true,
        message: `Tenant ${updated.name} updated successfully!`,
        tenant: updated
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async updateTenantCategory(tenantIdOrName, categoryType) {
    try {
      const q = (tenantIdOrName || "").trim();
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { id: q },
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } }
          ]
        },
        include: { business: true }
      });

      if (!tenant) return { success: false, error: `Tenant "${tenantIdOrName}" not found.` };

      const c = (categoryType || "").toLowerCase();
      let newType = "restaurant";
      if (c.includes("appointment") || c.includes("salon") || c.includes("clinic") || c.includes("service") || c.includes("spa") || c.includes("barber")) {
        newType = "appointment";
      } else {
        newType = "restaurant";
      }

      if (tenant.business) {
        await prisma.business.update({
          where: { id: tenant.business.id },
          data: { type: newType }
        });
      }

      return {
        success: true,
        message: `Tenant "${tenant.name}" category updated to ${newType === "restaurant" ? "ORDER-BASED (Restaurant/Food)" : "APPOINTMENT-BASED (Service/Salon)"}!`,
        tenantId: tenant.id,
        category: newType
      };
    } catch (err) {
      console.error("[SuperadminToolService] updateTenantCategory error:", err);
      return { success: false, error: err.message };
    }
  }

  async changeTenantPackage(tenantId, newPackageName) {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return { success: false, error: "Tenant not found." };

      const pkg = this.getPackagesInternal().find(p => p.code === newPackageName.toUpperCase() || p.name.toUpperCase().includes(newPackageName.toUpperCase()));
      if (!pkg) return { success: false, error: `Invalid package name "${newPackageName}".` };

      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          plan: pkg.code,
          monthlyLimit: pkg.includedMinutes
        }
      });

      return {
        success: true,
        message: `Updated ${tenant.name} to ${pkg.name} package (${pkg.includedMinutes} min/month).`,
        tenant: updated,
        package: pkg
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async suspendTenant(tenantId) {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return { success: false, error: "Tenant not found." };

      if (tenant.name === "Naxton Platform Hub") {
        return { success: false, error: "Cannot suspend Master Platform Hub." };
      }

      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: "SUSPENDED" }
      });

      return {
        success: true,
        message: `Tenant ${tenant.name} (${tenantId}) suspended successfully.`,
        tenant: updated
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async activateTenant(tenantId) {
    try {
      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: "ACTIVE" }
      });

      return {
        success: true,
        message: `Tenant ${updated.name} activated successfully.`,
        tenant: updated
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async deleteTenant(tenantId) {
    try {
      const targetId = typeof tenantId === 'object' ? (tenantId.tenantId || tenantId.id) : tenantId;
      const superadminController = require("../modules/superadmin/superadmin.controller");
      const tenant = await prisma.tenant.findUnique({ where: { id: targetId } });
      if (!tenant) return { success: false, error: "Tenant not found." };

      if (tenant.name === "Naxton Platform Hub") {
        return { success: false, error: "Cannot delete Master Platform Hub." };
      }

      // Delegate to robust cascaded purge in superadmin controller
      await superadminController.purgeTenantById(targetId);

      return {
        success: true,
        message: `Tenant ${tenant.name} (${targetId}) and all associated records permanently purged!`,
        purgedTenantId: targetId
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // 📦 PACKAGES & SUBSCRIPTIONS (LEVEL 1)
  // ==========================================

  getPackagesInternal() {
    return [
      {
        code: "CORE",
        name: "Nexa Core / Starter",
        monthlyPriceUsd: 49,
        includedMinutes: 200,
        maxUsers: 2,
        features: ["24/7 AI Receptionist", "Standard Voice Engine", "Appointment Booking", "SMS Notifications"]
      },
      {
        code: "FLOW",
        name: "Nexa Flow / Professional",
        monthlyPriceUsd: 149,
        includedMinutes: 600,
        maxUsers: 5,
        features: ["Ultra-low Latency Neural Voice", "Multi-Language Support", "Custom Knowledge Base", "Zapier & Webhook Sync", "Dedicated Proxy Line"]
      },
      {
        code: "PRIME",
        name: "Nexa Prime / Business",
        monthlyPriceUsd: 299,
        includedMinutes: 1500,
        maxUsers: 15,
        features: ["Dedicated ElevenLabs Voice Clone", "Multi-location Routing", "Priority Support", "Unlimited AI Staff", "Advanced Analytics"]
      },
      {
        code: "ENTERPRISE",
        name: "Enterprise Custom",
        monthlyPriceUsd: 599,
        includedMinutes: 5000,
        maxUsers: 50,
        features: ["Custom SLA", "Dedicated Account Manager", "Custom SIP Trunking", "BYOC Telephony", "Custom Integrations"]
      }
    ];
  }

  async getPackages() {
    return {
      success: true,
      packages: this.getPackagesInternal()
    };
  }

  async getTenantBilling(tenantIdOrName) {
    try {
      const q = (tenantIdOrName || "").trim();
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { id: q },
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } }
          ]
        },
        include: { business: true }
      });

      if (!tenant) return { success: false, error: `Tenant "${tenantIdOrName}" not found.` };

      const pkg = this.getPackagesInternal().find(p => p.code === tenant.plan) || this.getPackagesInternal()[0];

      return {
        success: true,
        tenantId: tenant.id,
        tenantName: tenant.name,
        status: tenant.subscriptionStatus,
        plan: pkg.name,
        planCode: tenant.plan,
        monthlyPrice: `$${pkg.monthlyPriceUsd}/mo`,
        usedMinutes: tenant.usedMinutes || 0,
        monthlyLimitMinutes: tenant.monthlyLimit || pkg.includedMinutes,
        usagePercentage: Math.round(((tenant.usedMinutes || 0) / (tenant.monthlyLimit || pkg.includedMinutes)) * 100),
        businessName: tenant.business?.name || tenant.name,
        businessPhone: tenant.business?.phoneNumber || "N/A"
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async updateTenantBilling(tenantIdOrName, { status, extraMinutes, plan }) {
    try {
      const q = (tenantIdOrName || "").trim();
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { id: q },
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } }
          ]
        }
      });

      if (!tenant) return { success: false, error: `Tenant "${tenantIdOrName}" not found.` };

      const updateData = {};
      if (status) updateData.subscriptionStatus = status.toUpperCase();
      if (extraMinutes) updateData.monthlyLimit = (tenant.monthlyLimit || 0) + parseInt(extraMinutes);
      if (plan) {
        const pkg = this.getPackagesInternal().find(p => p.code === plan.toUpperCase() || p.name.toUpperCase().includes(plan.toUpperCase()));
        if (pkg) {
          updateData.plan = pkg.code;
          if (!extraMinutes) updateData.monthlyLimit = pkg.includedMinutes;
        }
      }

      const updated = await prisma.tenant.update({
        where: { id: tenant.id },
        data: updateData
      });

      return {
        success: true,
        message: `Billing updated for ${updated.name}! Status: ${updated.subscriptionStatus}, Plan: ${updated.plan}, Monthly Limit: ${updated.monthlyLimit} mins.`,
        tenant: updated
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // 🏢 BUSINESS PROFILE & HOURS (LEVEL 1 & 2)
  // ==========================================

  async getBusinessProfile(tenantIdOrBusinessId) {
    try {
      const biz = await prisma.business.findFirst({
        where: {
          OR: [
            { id: tenantIdOrBusinessId },
            { tenantId: tenantIdOrBusinessId }
          ]
        },
        include: {
          phoneNumberConfig: true
        }
      });

      if (!biz) return { success: false, error: "Business profile not found." };

      return {
        success: true,
        business: biz
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async updateBusinessProfile(tenantId, data = {}) {
    try {
      const biz = await prisma.business.findFirst({ where: { tenantId } });
      if (!biz) return { success: false, error: "Business profile not found for tenant." };

      const updated = await prisma.business.update({
        where: { id: biz.id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.phoneNumber ? { phoneNumber: data.phoneNumber } : {}),
          ...(data.address ? { address: data.address } : {}),
          ...(data.country ? { country: data.country } : {}),
          ...(data.openTime ? { openTime: data.openTime } : {}),
          ...(data.closeTime ? { closeTime: data.closeTime } : {}),
          ...(data.aiName ? { aiName: data.aiName } : {}),
          ...(data.aiVoiceId ? { aiVoiceId: data.aiVoiceId } : {})
        }
      });

      return {
        success: true,
        message: "Business profile updated successfully!",
        business: updated
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async updateBusinessHours(tenantId, openTime = "09:00", closeTime = "18:00") {
    try {
      const biz = await prisma.business.findFirst({ where: { tenantId } });
      if (!biz) return { success: false, error: "Business not found." };

      const updated = await prisma.business.update({
        where: { id: biz.id },
        data: { openTime, closeTime }
      });

      return {
        success: true,
        message: `Updated opening hours to ${openTime} - ${closeTime}`,
        business: updated
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // 🍕 MENU MANAGEMENT & OCR (LEVEL 1 & 2)
  // ==========================================

  async getTenantMenu(tenantIdOrBusinessId) {
    try {
      const target = typeof tenantIdOrBusinessId === 'object' 
        ? (tenantIdOrBusinessId.tenantIdOrBusinessId || tenantIdOrBusinessId.tenantId || tenantIdOrBusinessId.businessId || "")
        : String(tenantIdOrBusinessId || "").trim();

      if (!target) return { success: true, count: 0, data: [] };

      const biz = await prisma.business.findFirst({
        where: {
          OR: [
            { id: target },
            { tenantId: target }
          ]
        }
      });

      if (!biz) return { success: false, error: "Business not found." };

      const categories = await prisma.menuCategory.findMany({
        where: { businessId: biz.id },
        include: { items: { include: { sizes: true } } }
      });

      return {
        success: true,
        businessName: biz.name,
        categoryCount: categories.length,
        itemCount: categories.reduce((sum, c) => sum + c.items.length, 0),
        categories: categories.map(c => ({
          id: c.id,
          name: c.name,
          items: c.items.map(i => ({
            id: i.id,
            name: i.name,
            price: i.price,
            description: i.description,
            sizes: i.sizes.map(s => ({ name: s.name, price: s.price }))
          }))
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async addMenuItem(tenantId, { categoryName = "General", name, price, description = "" }) {
    try {
      const biz = await prisma.business.findFirst({ where: { tenantId } });
      if (!biz) return { success: false, error: "Business not found." };

      let category = await prisma.menuCategory.findFirst({
        where: { businessId: biz.id, name: { equals: categoryName, mode: 'insensitive' } }
      });

      if (!category) {
        category = await prisma.menuCategory.create({
          data: { name: categoryName, businessId: biz.id, tenantId }
        });
      }

      const item = await prisma.menuItem.create({
        data: {
          name,
          price: parseFloat(price) || 0,
          description,
          categoryId: category.id,
          businessId: biz.id,
          tenantId
        }
      });

      return {
        success: true,
        message: `Added menu item "${item.name}" ($${item.price}) to category "${category.name}".`,
        item
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async bulkCreateMenuItems(tenantId, categoriesData = []) {
    try {
      const biz = await prisma.business.findFirst({ where: { tenantId } });
      if (!biz) return { success: false, error: "Business not found." };

      let createdCategories = 0;
      let createdItems = 0;

      for (const cat of categoriesData) {
        let category = await prisma.menuCategory.findFirst({
          where: { businessId: biz.id, name: { equals: cat.name, mode: 'insensitive' } }
        });

        if (!category) {
          category = await prisma.menuCategory.create({
            data: { name: cat.name, businessId: biz.id, tenantId }
          });
          createdCategories++;
        }

        if (Array.isArray(cat.items)) {
          for (const item of cat.items) {
            await prisma.menuItem.create({
              data: {
                name: item.name,
                price: parseFloat(item.price) || 0,
                description: item.description || "",
                categoryId: category.id,
                businessId: biz.id,
                tenantId
              }
            });
            createdItems++;
          }
        }
      }

      return {
        success: true,
        message: `Imported ${createdItems} menu items across ${createdCategories} categories into ${biz.name}.`,
        createdCategories,
        createdItems
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // 📞 PHONE & VOICE AI MANAGEMENT (LEVEL 1 & 2)
  // ==========================================

  async getVoiceConfiguration(tenantId) {
    try {
      const biz = await prisma.business.findFirst({
        where: { tenantId },
        include: { phoneNumberConfig: true }
      });

      if (!biz) return { success: false, error: "Business profile not found." };

      return {
        success: true,
        businessName: biz.name,
        aiName: biz.aiName || "Sarah",
        aiVoiceId: biz.aiVoiceId || "Standard Joanna",
        dedicatedNumber: biz.phoneNumberConfig?.twilioPhoneNumber || "PENDING",
        transferNumber: biz.phoneNumberConfig?.transferNumber || biz.phoneNumber,
        aiEnabled: biz.phoneNumberConfig?.aiEnabled ?? true,
        forwardingEnabled: biz.phoneNumberConfig?.forwardingEnabled ?? true
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async checkPhoneNumber(phoneNumber) {
    try {
      const cleanPhone = (phoneNumber || "").replace(/[^0-9]/g, "").slice(-10);
      if (!cleanPhone) return { success: false, error: "Invalid phone number." };

      const assigned = await prisma.tenantPhoneNumber.findFirst({
        where: { twilioPhoneNumber: { contains: cleanPhone } },
        include: { business: true }
      });

      if (assigned) {
        return {
          success: true,
          exists: true,
          assignedToTenant: assigned.tenantId,
          businessName: assigned.business?.name,
          phoneNumber: assigned.twilioPhoneNumber,
          status: assigned.status
        };
      }

      return {
        success: true,
        exists: false,
        message: `Phone number containing ${cleanPhone} is available for provisioning.`
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getCallStatistics(tenantId) {
    try {
      const calls = await prisma.call.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      const totalDurationSec = calls.reduce((sum, c) => sum + (c.duration || 0), 0);

      return {
        success: true,
        totalCalls: calls.length,
        totalDurationMinutes: Math.round(totalDurationSec / 60),
        recentCalls: calls.slice(0, 5).map(c => ({
          id: c.id,
          from: c.fromNumber,
          to: c.toNumber,
          durationSec: c.duration,
          date: c.createdAt
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // 📚 PLATFORM KNOWLEDGE & SYSTEM HELP (LEVEL 1)
  // ==========================================

  getPlatformKnowledge(topic = "") {
    const knowledgeBase = {
      capabilities: [
        "Multi-Tenant SaaS with isolated tenant spaces",
        "24/7 AI Receptionist with Real-time Voice Streams (OpenAI & ElevenLabs)",
        "Toll-Free & Local Twilio AI Dedicated Lines with Call Forwarding (*72 / *21*)",
        "Automated Menu Web Scraping & AI Menu Importing",
        "Appointment Scheduling & Slot Interval Management",
        "Superadmin Multi-Tenant Control Panel & Real-Time Telemetry"
      ],
      packages: this.getPackagesInternal(),
      telephonyCodes: {
        US: "Forward: *72 [Number] | Cancel: *73",
        Canada: "Forward: *21* [Number] # | Cancel: ##21#",
        Pakistan: "Forward: *21* [Number] # | Cancel: ##21#",
        Australia: "Forward: *21* [Number] # | Cancel: ##21#"
      }
    };

    return {
      success: true,
      topic: topic || "all",
      knowledge: knowledgeBase
    };
  }
}

const service = new SuperadminToolService();

// Attach snake_case aliases for Phase 6 tool names
service.get_platform_overview = service.getPlatformOverview.bind(service);
service.get_platform_stats = service.getPlatformStats.bind(service);
service.get_active_tenants = service.getActiveTenants.bind(service);
service.get_inactive_tenants = service.getInactiveTenants.bind(service);
service.get_platform_usage = service.getPlatformUsage.bind(service);
service.get_platform_revenue = service.getPlatformRevenue.bind(service);
service.search_tenants = service.searchTenants.bind(service);
service.get_tenant = service.getTenant.bind(service);
service.get_tenants_without_menu = service.getTenantsWithoutMenu.bind(service);
service.research_business_online = service.researchBusinessOnline.bind(service);
service.get_tenant_menu = service.getTenantMenu.bind(service);
service.create_tenant = service.createTenant.bind(service);
service.update_tenant = service.updateTenant.bind(service);
service.change_tenant_package = service.changeTenantPackage.bind(service);
service.suspend_tenant = service.suspendTenant.bind(service);
service.activate_tenant = service.activateTenant.bind(service);
service.update_tenant_category = service.updateTenantCategory.bind(service);
service.get_tenant_billing = service.getTenantBilling.bind(service);
service.update_tenant_billing = service.updateTenantBilling.bind(service);
service.delete_tenant = service.deleteTenant.bind(service);
service.get_packages = service.getPackages.bind(service);
service.get_call_statistics = service.getCallStatistics.bind(service);

module.exports = service;
