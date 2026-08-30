
const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^\w ]+/g, "")
    .replace(/ +/g, "-");
};

/* ======================================
   GET ALL TENANTS
====================================== */
exports.getTenants = async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: {
        name: { not: "Naxton Platform Hub" }
      },
      orderBy: { createdAt: "desc" },
      include: {
        businesses: {
          select: { id: true, name: true },
          take: 1
        }
      }
    });

    res.json({ success: true, data: tenants });
  } catch (error) {
    console.error("Load tenants error:", error);
    res.json({ success: false, message: "Failed to load tenants: " + error.message });
  }
};

/* ======================================
   GET ALL BUSINESSES (for dropdown)
====================================== */
exports.getAllBusinesses = async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" }
    });
    res.json({ success: true, data: businesses });
  } catch (error) {
    console.error("Get all businesses error:", error);
    res.json({ success: false, message: error.message });
  }
};

/* ======================================
   CREATE NEW TENANT
====================================== */
exports.createTenant = async (req, res) => {
  try {
    const { name, ownerEmail, ownerPassword, type, subType, currency, importUrl, isDemo, initialTokens } = req.body;
    const scraperService = require("../../services/scraper.service");

    if (!ownerPassword) {
      return res.status(400).json({ success: false, message: "Password is required" });
    }

    const hashed = await bcrypt.hash(ownerPassword, 10);

    const baseSlug = generateSlug(name);
    const slug = `${baseSlug}-${Math.floor(Math.random() * 900) + 100}`; // Add 3 digits for uniqueness

    // 0. Calculate Trial
    const { plan, trialDays: trialDaysOverride } = req.body;
    const settingsService = require("../../services/settings.service");
    const settings = await settingsService.getSettings("TENANT");
    
    const trialDays = parseInt(trialDaysOverride) || parseInt(settings.trialDays) || 14;
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + trialDays);

    // Plan Defaults
    const { PLANS } = require("../../constants/plans");
    const selectedPlanId = (plan || 'nexa_core').toUpperCase().replace("-", "_");
    const planConfig = PLANS[selectedPlanId] || PLANS.NEXA_CORE;

    // 1. Create Tenant & Owner
    const tenant = await prisma.tenant.create({
      data: {
        name: name,
        slug: slug,
        plan: planConfig.id,
        isDemoAccount: isDemo === true,
        tokenBalance: parseInt(initialTokens) || planConfig.monthlyMinutes,
        totalTokensPurchased: parseInt(initialTokens) || planConfig.monthlyMinutes,
        monthlyLimit: planConfig.monthlyMinutes,
        monthlyTokenLimit: planConfig.monthlyTokens,
        staffLimit: planConfig.maxStaff,
        businessLimit: planConfig.maxBusinesses,
        trialEndDate: trialEndDate,
        subscriptionStatus: "ACTIVE",
        users: {
          create: {
            email: ownerEmail,
            password: hashed,
            role: "OWNER"
          }
        }
      }
    });

    // 2. Create Initial Business
    const business = await prisma.business.create({
      data: {
        name: name,
        type: type || "restaurant",
        subType: subType || null,
        currency: currency || "USD",
        phoneNumber: "Pending",
        tenantId: tenant.id
      }
    });

    // 2.5 Smart Auto-Setup for Appointment Businesses
    if (type === "appointment" && subType) {
      const businessController = require("../business/business.controller");
      // Note: We need to expose initializeDefaultServices or handle it here
      // For now, I'll just manually call a helper or implement it in a shared service
      // But let's assume we want the same logic as business.controller.js
      await initializeDefaultServicesLocal(tenant.id, business.id, subType);
    }

    // 3. Trigger Smart Import in background if URL provided
    if (importUrl) {
      const io = req.app.get("io");
      scraperService.importBusinessData(business.id, importUrl, io).catch(err => {
        console.error("[Superadmin] Background import error:", err);
      });
    }

    res.json({
      success: true,
      data: { tenant, business }
    });

  } catch (error) {
    console.error("Create tenant error:", error);
    res.json({
      success: false,
      message: error.message
    });
  }
};

/* ======================================
   DELETE TENANT (With Security)
====================================== */
exports.deleteTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { adminPassword } = req.body;
    const superadminId = req.user.id;

    // 1. Verify Superadmin Identity & Password
    const superadmin = await prisma.user.findUnique({ where: { id: superadminId } });
    const isMatch = await bcrypt.compare(adminPassword, superadmin.password);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid administrator password. Access Denied." });
    }

    // 1. Fetch IDs for deep cascade (Safely)
    const [bizIds, convoIds, ticketIds, userIds] = await Promise.all([
      prisma.business.findMany({ where: { tenantId }, select: { id: true } }).then(res => res.map(r => r.id)),
      prisma.conversation.findMany({ where: { tenantId }, select: { id: true } }).then(res => res.map(r => r.id)),
      prisma.ticket.findMany({ where: { tenantId }, select: { id: true } }).then(res => res.map(r => r.id)),
      prisma.user.findMany({ where: { tenantId }, select: { id: true } }).then(res => res.map(r => r.id))
    ]);

    // 2. Perform Cascaded Purge (Batched for stability)
    // Batch 1: Communication & Support Data
    await prisma.$transaction([
      prisma.conversationMessage.deleteMany({ where: { conversationId: { in: convoIds } } }),
      prisma.ticketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      prisma.ticketActivity.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      prisma.ticketAttachment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      prisma.notification.deleteMany({ where: { tenantId } })
    ]);

    // Batch 2: Commerce & Menus
    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { tenantId } }),
      prisma.menuVariant.deleteMany({ where: { tenantId } }),
      prisma.menuOption.deleteMany({ where: { tenantId } }),
      prisma.menuSize.deleteMany({ where: { tenantId } }),
      prisma.menuAddon.deleteMany({ where: { tenantId } }),
      prisma.menuAvailability.deleteMany({ where: { menuItem: { tenantId } } }),
      prisma.menuItemAlias.deleteMany({ where: { tenantId } }),
      prisma.menuItemAddon.deleteMany({ where: { menuItem: { tenantId } } }),
      prisma.menuItemModifierGroup.deleteMany({ where: { menuItem: { tenantId } } }),
      prisma.modifierOption.deleteMany({ where: { group: { tenantId } } }),
      prisma.order.deleteMany({ where: { tenantId } }),
      prisma.menuItem.deleteMany({ where: { tenantId } }),
      prisma.menuCategory.deleteMany({ where: { tenantId } }),
      prisma.modifierGroup.deleteMany({ where: { tenantId } })
    ]);

    // Batch 3: Appointments & Staffing
    await prisma.$transaction([
      prisma.staffService.deleteMany({ where: { staff: { tenantId } } }),
      prisma.serviceVariant.deleteMany({ where: { tenantId } }),
      prisma.serviceAddon.deleteMany({ where: { tenantId } }),
      prisma.serviceAvailability.deleteMany({ where: { tenantId } }),
      prisma.serviceAlias.deleteMany({ where: { tenantId } }),
      prisma.appointmentService.deleteMany({ where: { tenantId } }),
      prisma.serviceCategory.deleteMany({ where: { tenantId } }),
      prisma.staff.deleteMany({ where: { tenantId } }),
      prisma.appointment.deleteMany({ where: { tenantId } }),
      prisma.blockedTime.deleteMany({ where: { tenantId } })
    ]);

    // Batch 4: Infrastructure & Final Purge
    await prisma.$transaction([
      prisma.integrationLog.deleteMany({ where: { integration: { tenantId } } }),
      prisma.integrationCredential.deleteMany({ where: { integration: { tenantId } } }),
      prisma.integration.deleteMany({ where: { tenantId } }),
      prisma.knowledgeArticle.deleteMany({ where: { tenantId } }),
      prisma.knowledgeCategory.deleteMany({ where: { tenantId } }),
      prisma.supportSettings.deleteMany({ where: { tenantId } }),
      prisma.employeeProfile.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.sLAPolicy.deleteMany({ where: { tenantId } }),
      prisma.supportDepartment.deleteMany({ where: { tenantId } }),
      prisma.externalMapping.deleteMany({ where: { tenantId } }),
      prisma.mintRequest.deleteMany({ where: { tenantId } }),
      prisma.tenantPhoneNumber.deleteMany({ where: { tenantId } }),
      prisma.callRoutingRule.deleteMany({ where: { tenantId } }),
      prisma.callAnalytics.deleteMany({ where: { tenantId } }),
      prisma.customer.deleteMany({ where: { tenantId } }),
      prisma.business.deleteMany({ where: { tenantId } }),
      prisma.user.deleteMany({ where: { tenantId } }),
      prisma.tenant.delete({ where: { id: tenantId } })
    ]);

    res.json({
      success: true,
      message: "Tenant and all associated data purged successfully."
    });

  } catch (error) {
    console.error("CRITICAL DELETE ERROR:", error);
    
    // Log more details if it's a Prisma error
    if (error.code) {
        console.error("Prisma Error Code:", error.code);
        console.error("Prisma Meta:", error.meta);
    }

    res.status(500).json({ 
      success: false, 
      message: `Deletion failed: ${error.message}.` 
    });
  }
};

/* ======================================
   PLATFORM ANALYTICS
====================================== */
exports.getAnalytics = async (req, res) => {
  try {
    const { businessId } = req.query;
    // Only apply filter if businessId is provided and NOT an empty string
    const filter = (businessId && businessId !== "") ? { businessId } : {};

    console.log("[Analytics] Fetching for business:", businessId || 'ALL');
    const totalTenants = await prisma.tenant.count({
      where: {
        name: { not: "Naxton Platform Hub" }
      }
    });
    console.log("[Analytics] Tenants count:", totalTenants);
    
    const totalUsers = await prisma.user.count({
      where: {
        role: { not: "SUPERADMIN" }
      }
    });
    const totalOrders = await prisma.order.count({ where: filter });
    const totalCalls = await prisma.call.count({ where: filter });
    console.log("[Analytics] Orders:", totalOrders, "Calls:", totalCalls);

    const avgDuration = await prisma.call.aggregate({
      where: filter,
      _avg: { duration: true }
    });

    const today = new Date();
    today.setHours(0,0,0,0);

    const callsToday = await prisma.call.count({
      where: { ...filter, createdAt: { gte: today } }
    });

    const ordersToday = await prisma.order.count({
      where: { ...filter, createdAt: { gte: today } }
    });

    const conversionRate = totalCalls ? ((totalOrders / totalCalls) * 100).toFixed(1) : 0;
    const displayConversionRate = Math.min(conversionRate, 100);

    const orders = await prisma.order.findMany({
      where: filter,
      select: { total: true, createdAt: true }
    });

    const revenueMap = {};
    orders.forEach(o => {
      const date = o.createdAt.toISOString().split("T")[0];
      revenueMap[date] = (revenueMap[date] || 0) + (o.total || 0);
    });

    const calls = await prisma.call.findMany({
      where: filter,
      select: { createdAt: true }
    });

    const callsMap = {};
    calls.forEach(c => {
      const date = c.createdAt.toISOString().split("T")[0];
      callsMap[date] = (callsMap[date] || 0) + 1;
    });


    /* ------------------------------
       CHART DATA FORMATTING
    ------------------------------ */
    
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split("T")[0];
    }).reverse();

    const revenueChart = {
      labels: last7Days,
      values: last7Days.map(date => parseFloat((revenueMap[date] || 0).toFixed(2)))
    };

    const callsChart = {
      labels: last7Days,
      values: last7Days.map(date => callsMap[date] || 0)
    };

    /* ------------------------------
       SUPPORT INTELLIGENCE METRICS
    ------------------------------ */
    const allTickets = await prisma.ticket.findMany({
      select: { createdAt: true, resolvedAt: true, status: true }
    });

    const ticketsMap = {};
    let totalResolutionTime = 0;
    let resolvedCount = 0;
    let compliantCount = 0;

    allTickets.forEach(t => {
      const date = t.createdAt.toISOString().split("T")[0];
      ticketsMap[date] = (ticketsMap[date] || 0) + 1;

      if (t.resolvedAt) {
        const diff = t.resolvedAt.getTime() - t.createdAt.getTime();
        totalResolutionTime += diff;
        resolvedCount++;

        // Compliance: resolved within 24 hours (86400000 ms)
        if (diff <= 86400000) compliantCount++;
      }
    });

    const resolutionVelocity = resolvedCount ? Math.round(totalResolutionTime / resolvedCount / 3600000) : 0; // Hours
    const complianceScore = resolvedCount ? Math.round((compliantCount / resolvedCount) * 100) : 100;
    
    const avgResponseTime = 12; // Mocked

    const supportVolumeChart = last7Days.map(date => ({
      day: date,
      count: ticketsMap[date] || 0
    }));

    const openCount = allTickets.filter(t => t.status === 'open' || t.status === 'pending').length;
    const totalTicketsCount = allTickets.length;

    // Active unassigned chats
    const unassignedChats = await prisma.conversation.count({
      where: {
        status: { in: ['open', 'escalated'] },
        assignedToId: null
      }
    });

    const activeChatsCount = await prisma.conversation.count({
      where: { status: { notIn: ['resolved', 'closed'] } }
    });

    const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);

    const finalData = {
      tenants: totalTenants,
      users: totalUsers,
      orders: totalOrders,
      calls: totalCalls,
      totalRevenue,
      callsToday,
      ordersToday,
      avgDuration: Math.round(avgDuration._avg.duration || 0),
      conversionRate,
      displayConversionRate,
      revenueChart,
      callsChart,
      supportMetrics: {
        velocity: resolutionVelocity,
        compliance: complianceScore,
        response: avgResponseTime,
        volumeChart: supportVolumeChart,
        openCount,
        totalTickets: totalTicketsCount,
        unassignedChats,
        activeChats: activeChatsCount
      }
    };
    console.log("[Analytics] Sending data:", JSON.stringify(finalData, null, 2));
    res.json({
      success: true,
      data: finalData
    });

  } catch (error) {
    console.error("Analytics error:", error);
    res.json({
      success: false,
      message: "failed to load analytics: " + (error.message || "Unknown error"),
      error: error.stack
    });
  }
};



/* ======================================
   RECENT CALLS (PLATFORM MONITOR)
====================================== */
exports.getRecentCalls = async (req, res) => {
  try {

    const calls = await prisma.call.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        business: true
      }
    });

    res.json({
      success: true,
      data: calls.map(c => ({
        ...c,
        isGuardianRescued: c.isGuardianRescued || false
      }))
    });

  } catch (error) {

    console.error("Recent calls error:", error);

    res.json({
      success: false,
      message: "Failed to load recent calls"
    });

  }
};


/* ======================================
   CALL TRANSCRIPTS (LATEST)
====================================== */
exports.getCallTranscripts = async (req, res) => {
  try {
    const { businessId } = req.query;
    const filter = businessId ? { businessId } : {};

    const calls = await prisma.call.findMany({
      where: {
        ...filter,
        transcript: { not: null }
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { business: true }
    });

    res.json({ success: true, data: calls });
  } catch (error) {
    console.error("Transcript fetch error:", error);
    res.json({ success: false, message: "Failed to load transcripts" });
  }
};

exports.getActivityFeed = async (req, res) => {
  try {
    const { businessId } = req.query;
    const filter = businessId ? { businessId } : {};

    const calls = await prisma.call.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { business: true }
    });

    const activities = calls.map(call => ({
      restaurant: call.business?.name || "Unknown",
      duration: call.duration || 0,
      tokens: call.tokensUsed || 0,
      createdAt: call.createdAt,
      isGuardianRescued: call.isGuardianRescued || false
    }));

    res.json({ success: true, data: activities });
  } catch (error) {
    console.error("Activity feed error:", error);
    res.json({ success: false, message: "Failed to load activity feed" });
  }
};


/* ======================================
   CALL INSPECTOR (DETAIL VIEW)
====================================== */
exports.getCallDetails = async (req, res) => {
  try {

    const { id } = req.params;

    const call = await prisma.call.findUnique({
      where: { id },
      include: {
        business: true
      }
    });

    if (!call) {
      return res.json({
        success: false,
        message: "Call not found"
      });
    }

    res.json({
      success: true,
      data: call
    });

  } catch (error) {

    console.error("Call details error:", error);

    res.json({
      success: false,
      message: "Failed to load call details"
    });

  }
};


/* ======================================
   TENANT REVENUE ANALYTICS
====================================== */
exports.getRevenueStats = async (req, res) => {
  try {

    const businesses = await prisma.business.findMany({
      include: {
        orders: true
      }
    });

    const revenueData = businesses.map(b => {

      const revenue = b.orders.reduce((sum, o) => {
        return sum + (o.total || 0);
      }, 0);

      return {
        name: b.name,
        revenue
      };
    });

    const totalRevenue = revenueData.reduce((sum, r) => sum + r.revenue, 0);

    const topRestaurants = revenueData
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        totalRevenue,
        topRestaurants
      }
    });

  } catch (error) {

    console.error("Revenue analytics error:", error);

    res.json({
      success: false,
      message: "Failed to load revenue analytics"
    });

  }
};


/* ======================================
   RESTAURANT PERFORMANCE DASHBOARD
====================================== */
exports.getRestaurantPerformance = async (req, res) => {
  try {

    const businesses = await prisma.business.findMany({
      include: {
        orders: true,
        calls: true
      }
    });

    const today = new Date();
    today.setHours(0,0,0,0);

    const performance = businesses.map(b => {

      const callsToday = b.calls.filter(c =>
        new Date(c.createdAt) >= today
      );

      const ordersToday = b.orders.filter(o =>
        new Date(o.createdAt) >= today
      );

      const revenueToday = parseFloat(ordersToday.reduce((sum, o) =>
        sum + (o.total || 0), 0).toFixed(2));

      const avgDuration =
        b.calls.length
          ? Math.round(
              b.calls.reduce((sum, c) =>
                sum + (c.duration || 0), 0) / b.calls.length
            )
          : 0;

      return {
        name: b.name,
        callsToday: callsToday.length,
        ordersToday: ordersToday.length,
        revenueToday,
        avgDuration
      };

    });

    res.json({
      success: true,
      data: performance
    });

  } catch (error) {

    console.error("Restaurant performance error:", error);

    res.json({
      success: false,
      message: "Failed to load restaurant performance"
    });

  }
};


/* ======================================
   AI SALES LEADERBOARD
====================================== */
exports.getSalesLeaderboard = async (req, res) => {
  try {

    const orders = await prisma.order.findMany({
      include: {
        business: true,
        items: {
          include: { menuItem: true }
        }
      }
    });

    /* -----------------------------
       RESTAURANT REVENUE
    ----------------------------- */

    const restaurantMap = {};

    orders.forEach(o => {

      const name = o.business?.name || "Unknown";

      if (!restaurantMap[name]) {
        restaurantMap[name] = 0;
      }

      restaurantMap[name] += o.total || 0;
    });

    const topRestaurants = Object.entries(restaurantMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a,b) => b.revenue - a.revenue)
      .slice(0,5);

    /* -----------------------------
       TOP MENU ITEMS
    ----------------------------- */

    const itemMap = {};

    orders.forEach(o => {
      o.items?.forEach(i => {
        const name = i.menuItem?.name || "Unknown Item";
        if (!itemMap[name]) {
          itemMap[name] = 0;
        }
        itemMap[name] += i.quantity || 1;
      });
    });

    const topItems = Object.entries(itemMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a,b) => b.qty - a.qty)
      .slice(0,5);

    /* -----------------------------
       SUCCESSFUL CALLS
    ----------------------------- */

    const calls = await prisma.call.findMany({
      orderBy: { duration: "desc" },
      take: 5,
      include: {
        business: true
      }
    });

    const topCalls = calls.map(c => ({
      restaurant: c.business?.name || "Unknown",
      duration: c.duration || 0,
      tokens: c.tokensUsed || 0
    }));

    res.json({
      success: true,
      data: {
        topRestaurants,
        topItems,
        topCalls
      }
    });

  } catch (error) {

    console.error("Leaderboard error:", error);

    res.json({
      success: false,
      message: "Failed to load leaderboard"
    });

  }
};

const fs = require("fs");
const path = require("path");

/* ======================================
   UPDATE PLATFORM SETTINGS
====================================== */
exports.updateSettings = async (req, res) => {
  try {
    const { voice, speed, responseDelay, projectName, twilioSid, twilioToken, openaiKey } = req.body;
    const configPath = path.join(__dirname, "../../config/platform.json");
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    
    if (voice) config.voice = voice;
    if (speed) config.speed = parseFloat(speed);
    if (responseDelay) config.responseDelay = parseFloat(responseDelay);
    if (projectName) config.projectName = projectName;
    if (twilioSid) config.twilioSid = twilioSid;
    if (twilioToken) config.twilioToken = twilioToken;
    if (openaiKey) config.openaiKey = openaiKey;
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({ success: false, message: "Failed to update settings" });
  }
};

/* ======================================
   UPLOAD PLATFORM LOGO
====================================== */
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const logoUrl = `/uploads/${req.file.filename}`;
    
    // Save to platform config
    const configPath = path.join(__dirname, "../../config/platform.json");
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    
    config.logoUrl = logoUrl;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    res.json({
      success: true,
      logoUrl: logoUrl
    });

  } catch (error) {
    console.error("Upload logo error:", error);
    res.status(500).json({ success: false, message: "Failed to upload logo" });
  }
};

/* ======================================
   GET PLATFORM SETTINGS
====================================== */
exports.getSettings = async (req, res) => {
  try {
    const configPath = path.join(__dirname, "../../config/platform.json");
    let config = { logoUrl: null };
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load settings" });
  }
};

/* ======================================
   TOKEN / MINT MANAGEMENT
====================================== */

exports.getMintRequests = async (req, res) => {
  try {
    const requests = await prisma.mintRequest.findMany({
      include: { tenant: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMintRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body; // APPROVED, REJECTED

    const request = await prisma.mintRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    if (status === "APPROVED" && request.status !== "APPROVED") {
      // Add tokens to tenant
      await prisma.tenant.update({
        where: { id: request.tenantId },
        data: {
          tokenBalance: { increment: request.amount },
          totalTokensPurchased: { increment: request.amount }
        }
      });
    }

    await prisma.mintRequest.update({
      where: { id: requestId },
      data: { status }
    });

    res.json({ success: true, message: `Request ${status.toLowerCase()} successfully.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addTokensManually = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { amount } = req.body;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        tokenBalance: { increment: parseInt(amount) },
        totalTokensPurchased: { increment: parseInt(amount) }
      }
    });

    res.json({ success: true, message: `${amount} tokens added successfully.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleDemoAccount = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { isDemoAccount: !tenant.isDemoAccount }
    });

    res.json({ success: true, isDemo: !tenant.isDemoAccount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function initializeDefaultServicesLocal(tenantId, businessId, subType) {
  const { seedDefaultServices } = require("../../services/appointment-seeder.service");
  await seedDefaultServices(businessId, tenantId, subType);
}

/* ======================================
   INFRASTRUCTURE MONITORING
====================================== */
exports.getInfrastructureStats = async (req, res) => {
  try {
    const metrics = await prisma.systemMetric.findMany({
      take: 100,
      orderBy: { timestamp: "desc" }
    });

    // Mocking some realtime health for the UI
    const health = {
      cpu: Math.floor(Math.random() * 40) + 10 + "%",
      ram: "4.2GB / 16GB",
      disk: "128GB / 512GB",
      uptime: "14d 6h 22m",
      websockets: Math.floor(Math.random() * 150) + 20,
      latency: "24ms"
    };

    res.json({ success: true, data: { metrics, health } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ======================================
   AI OPERATIONS CENTER
====================================== */
exports.getAiOperations = async (req, res) => {
  try {
    const calls = await prisma.call.findMany({
      take: 100,
      orderBy: { createdAt: "desc" }
    });

    const aiStats = {
      openai: { tokens: "1.2M", cost: "$24.50", latency: "850ms", errors: 0 },
      elevenlabs: { characters: "450k", cost: "$90.00", latency: "420ms", errors: 2 },
      deepgram: { minutes: "1,200", cost: "$12.00", latency: "150ms", errors: 1 },
      twilio: { minutes: "1,450", cost: "$18.50", latency: "N/A", errors: 0 }
    };

    res.json({ success: true, data: { calls, aiStats } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ======================================
   SECURITY & AUDIT LOGS
====================================== */
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 50,
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ======================================
   INCIDENT MANAGEMENT
====================================== */
exports.getIncidents = async (req, res) => {
  try {
    const incidents = await prisma.incident.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: incidents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createIncident = async (req, res) => {
  try {
    const { title, description, severity, affectedServices } = req.body;
    const incident = await prisma.incident.create({
      data: {
        title,
        description,
        severity,
        affectedServices,
        status: "investigating"
      }
    });
    res.json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ======================================
   QUEUE & WORKER MONITORING
====================================== */
exports.getQueueStats = async (req, res) => {
  try {
    // High-fidelity mock of background worker state
    const queues = [
      { name: "Transcription Engine", active: 4, waiting: 0, failed: 1, processed: 1420 },
      { name: "Voice Generation", active: 2, waiting: 1, failed: 0, processed: 850 },
      { name: "Order Synchronization", active: 0, waiting: 0, failed: 4, processed: 12400 },
      { name: "Smart Scraper", active: 1, waiting: 2, failed: 0, processed: 310 }
    ];
    res.json({ success: true, data: queues });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ======================================
   PHONE INVENTORY & TELEPHONY
====================================== */

exports.getPhoneInventory = async (req, res) => {
  try {
    const inventory = await prisma.tenantPhoneNumber.findMany({
      include: {
        tenant: { select: { id: true, name: true } },
        business: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: inventory });
  } catch (error) {
    console.error("Get phone inventory error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignPhoneToTenant = async (req, res) => {
  try {
    const { phoneId, tenantId, businessId } = req.body;

    if (!phoneId || !tenantId) {
      return res.status(400).json({ success: false, message: "Phone ID and Tenant ID are required." });
    }

    const updated = await prisma.tenantPhoneNumber.update({
      where: { id: phoneId },
      data: {
        tenantId: tenantId,
        businessId: businessId || null,
        status: "ACTIVE"
      }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Assign phone error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.provisionPlatformNumber = async (req, res) => {
  try {
    const { phoneNumber, businessId } = req.body;
    const twilioService = require("../../services/twilio");

    if (phoneNumber) {
      const result = await twilioService.purchaseAndConfigureNumber(phoneNumber, businessId);
      return res.json({
        success: true,
        message: `Successfully purchased and configured ${phoneNumber} with Naxton AI!`,
        data: result.dbRecord
      });
    }

    // Fallback if no specific phone number passed: run auto-sync across Twilio inventory
    const result = await twilioService.syncAllTwilioWebhooks();
    res.json({
      success: true,
      message: `Synced and configured ${result.count} phone numbers with Naxton AI!`,
      data: result.numbers
    });
  } catch (error) {
    console.error("Provision phone error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.syncTwilioPhoneNumbers = async (req, res) => {
  try {
    const twilioService = require("../../services/twilio");
    const result = await twilioService.syncAllTwilioWebhooks();
    res.json({
      success: true,
      message: `Successfully configured and synced ${result.count} Twilio numbers to Naxton AI webhooks!`,
      data: result.numbers
    });
  } catch (error) {
    console.error("Sync Twilio numbers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ======================================
   UPDATE TENANT PLAN & TRIAL
====================================== */
exports.updateTenantPlan = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { plan, trialDays, subscriptionStatus, monthlyLimit } = req.body;

    const updateData = {};
    if (plan) {
      const { PLANS } = require("../../constants/plans");
      const selectedPlanId = plan.toUpperCase().replace("-", "_");
      const planConfig = PLANS[selectedPlanId];
      
      if (planConfig) {
        updateData.plan = planConfig.id;
        updateData.monthlyLimit = planConfig.monthlyMinutes;
        updateData.monthlyTokenLimit = planConfig.monthlyTokens;
        updateData.staffLimit = planConfig.maxStaff;
        updateData.businessLimit = planConfig.maxBusinesses;
      }
    }
    if (subscriptionStatus) updateData.subscriptionStatus = subscriptionStatus;
    if (monthlyLimit) updateData.monthlyLimit = parseInt(monthlyLimit);
    
    if (trialDays) {
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + parseInt(trialDays));
      updateData.trialEndDate = trialEndDate;
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData
    });

    res.json({ success: true, message: 'Tenant plan updated successfully', data: tenant });
  } catch (error) {
    console.error('Update tenant plan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ======================================
   UPLOAD PLATFORM LOGO
====================================== */
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No logo file uploaded." });
    }

    // Construct the public URL for the uploaded file
    // Assuming upload middleware saves to public/uploads/ or similar
    const logoUrl = `/uploads/${req.file.filename}`;

    res.json({
      success: true,
      message: "Logo uploaded successfully",
      logoUrl: logoUrl
    });
  } catch (error) {
    console.error("Upload logo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ======================================
   DEMO CENTER ADMIN MANAGEMENT
====================================== */
exports.getAdminDemoMetrics = async (req, res) => {
  try {
    const demoService = require("../demo/demo.service");
    const { status, search, page, limit } = req.query;
    const result = await demoService.listAllDemoSessions({ status, search, page: parseInt(page) || 1, limit: parseInt(limit) || 50 });

    const totalActive = await prisma.demoSession.count({ where: { status: "ACTIVE" } });
    const totalExpired = await prisma.demoSession.count({ where: { status: "EXPIRED" } });
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayDemos = await prisma.demoSession.count({ where: { createdAt: { gte: today } } });

    res.json({
      success: true,
      data: {
        demos: result.demos,
        total: result.total,
        totalActive,
        totalExpired,
        todayDemos
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.extendAdminDemo = async (req, res) => {
  try {
    const demoService = require("../demo/demo.service");
    const { token } = req.params;
    const updated = await demoService.extendSession(token);
    if (!updated) return res.status(404).json({ success: false, message: "Demo not found" });
    res.json({ success: true, message: "Demo extended by 24 hours.", session: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deactivateAdminDemo = async (req, res) => {
  try {
    const demoService = require("../demo/demo.service");
    const { token } = req.params;
    const updated = await demoService.deactivateSession(token);
    if (!updated) return res.status(404).json({ success: false, message: "Demo not found" });
    res.json({ success: true, message: "Demo deactivated successfully.", session: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.releaseAdminDemoPhone = async (req, res) => {
  try {
    const demoService = require("../demo/demo.service");
    const { token } = req.params;
    const session = await prisma.demoSession.findUnique({ where: { token } });

    if (!session) return res.status(404).json({ success: false, message: "Demo not found" });

    // Release phone number back to unassigned inventory
    await demoService.releaseDemoPhoneNumber(session.businessId, session.tenantId);

    // Update demo session status to EXPIRED
    await prisma.demoSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" }
    });

    res.json({
      success: true,
      message: `Phone number ${session.phoneNumber || ''} released back to UNASSIGNED inventory!`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

