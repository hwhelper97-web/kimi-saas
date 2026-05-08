
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
    res.json({ success: false, message: "Failed to load tenants" });
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

    // 1. Create Tenant & Owner
    const tenant = await prisma.tenant.create({
      data: {
        name: name,
        slug: slug,
        isDemoAccount: isDemo === true,
        tokenBalance: parseInt(initialTokens) || 100,
        totalTokensPurchased: parseInt(initialTokens) || 100,
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

    // 1. Fetch IDs for deep cascade
    const businesses = await prisma.business.findMany({ where: { tenantId }, select: { id: true } });
    const bizIds = businesses.map(b => b.id);
    
    const integrations = await prisma.integration.findMany({ where: { businessId: { in: bizIds } }, select: { id: true } });
    const intIds = integrations.map(i => i.id);
    
    const menuItems = await prisma.menuItem.findMany({ where: { businessId: { in: bizIds } }, select: { id: true } });
    const itemIds = menuItems.map(i => i.id);

    const convos = await prisma.conversation.findMany({ where: { businessId: { in: bizIds } }, select: { id: true } });
    const convoIds = convos.map(c => c.id);

    // 2. Cascade Delete All Linked Data (Atomic Transaction)
    await prisma.$transaction([
      // Stage A: Leaf Nodes (Most Specific)
      prisma.message.deleteMany({ where: { conversationId: { in: convoIds } } }),
      prisma.orderItem.deleteMany({ where: { menuItemId: { in: itemIds } } }),
      prisma.menuSize.deleteMany({ where: { menuItemId: { in: itemIds } } }),
      prisma.menuAddon.deleteMany({ where: { menuItemId: { in: itemIds } } }),
      prisma.menuOption.deleteMany({ where: { optionGroup: { menuItemId: { in: itemIds } } } }),
      prisma.menuOptionGroup.deleteMany({ where: { menuItemId: { in: itemIds } } }),
      prisma.integrationLog.deleteMany({ where: { integrationId: { in: intIds } } }),
      prisma.integrationCredential.deleteMany({ where: { integrationId: { in: intIds } } }),

      // Stage B: Mid-Level Parents
      prisma.conversation.deleteMany({ where: { id: { in: convoIds } } }),
      prisma.ticket.deleteMany({ where: { businessId: { in: bizIds } } }),
      prisma.integration.deleteMany({ where: { id: { in: intIds } } }),
      prisma.order.deleteMany({ where: { businessId: { in: bizIds } } }),
      prisma.menuItem.deleteMany({ where: { id: { in: itemIds } } }),
      prisma.menuCategory.deleteMany({ where: { businessId: { in: bizIds } } }),
      prisma.knowledgeArticle.deleteMany({ where: { businessId: { in: bizIds } } }),
      prisma.knowledgeCategory.deleteMany({ where: { businessId: { in: bizIds } } }),
      prisma.supportSettings.deleteMany({ where: { businessId: { in: bizIds } } }),

      // Stage C: Business-Level Records
      prisma.appointment.deleteMany({ where: { businessId: { in: bizIds } } }),
      prisma.call.deleteMany({ where: { businessId: { in: bizIds } } }),
      prisma.externalMapping.deleteMany({ where: { tenantId } }),
      prisma.mintRequest.deleteMany({ where: { tenantId } }),
      
      // Stage D: Core Platform Cleanup
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
    res.status(500).json({ 
      success: false, 
      message: `Deletion failed: ${error.message}. This is likely due to a data dependency. Check server logs.` 
    });
  }
};

/* ======================================
   PLATFORM ANALYTICS
====================================== */
exports.getAnalytics = async (req, res) => {
  try {
    const { businessId } = req.query;
    const filter = businessId ? { businessId } : {};

    const totalTenants = await prisma.tenant.count();
    const totalUsers = await prisma.user.count();
    const totalOrders = await prisma.order.count({ where: filter });
    const totalCalls = await prisma.call.count({ where: filter });

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

    res.json({
      success: true,
      data: {
        tenants: totalTenants,
        users: totalUsers,
        orders: totalOrders,
        calls: totalCalls,
        callsToday,
        ordersToday,
        avgDuration: Math.round(avgDuration._avg.duration || 0),
        conversionRate,
        displayConversionRate,
        revenueChart,
        callsChart
      }
    });

  } catch (error) {
    console.error("Analytics error:", error);
    res.json({
      success: false,
      message: "Failed to load analytics"
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
  const templates = {
    "Barber Shop": [
      { name: "Haircut", price: 20, category: "Grooming", serviceDuration: 30 },
      { name: "Beard Trim", price: 10, category: "Grooming", serviceDuration: 15 },
      { name: "Hair Wash", price: 5, category: "Grooming", serviceDuration: 10 },
      { name: "Facial", price: 25, category: "Skin Care", serviceDuration: 30 },
      { name: "Hair Coloring", price: 50, category: "Treatments", serviceDuration: 60 },
      { name: "Head Massage", price: 15, category: "Relaxation", serviceDuration: 20 },
      { name: "Kids Haircut", price: 12, category: "Grooming", serviceDuration: 20 }
    ],
    "Beauty Salon": [
      { name: "Hair Styling", price: 60, category: "Hair", serviceDuration: 60 },
      { name: "Hair Coloring", price: 150, category: "Hair", serviceDuration: 120 },
      { name: "Makeup", price: 80, category: "Makeup", serviceDuration: 90 },
      { name: "Manicure", price: 30, category: "Nails", serviceDuration: 45 },
      { name: "Pedicure", price: 35, category: "Nails", serviceDuration: 45 },
      { name: "Bridal Package", price: 500, category: "Premium", serviceDuration: 240 },
      { name: "Waxing", price: 40, category: "Body", serviceDuration: 30 },
      { name: "Facial", price: 80, category: "Skin", serviceDuration: 60 }
    ],
    "Spa Center": [
      { name: "Full Body Massage", price: 80, category: "Massage", serviceDuration: 60 },
      { name: "Hot Stone Massage", price: 120, category: "Therapy", serviceDuration: 90 },
      { name: "Steam Bath", price: 30, category: "Relaxation", serviceDuration: 30 },
      { name: "Aromatherapy", price: 90, category: "Therapy", serviceDuration: 60 },
      { name: "Couple Spa", price: 250, category: "Premium", serviceDuration: 120 },
      { name: "Foot Massage", price: 30, category: "Relaxation", serviceDuration: 30 },
      { name: "Sauna", price: 40, category: "Relaxation", serviceDuration: 45 }
    ],
    "Dental Clinic": [
      { name: "Dental Checkup", price: 50, category: "Exam", serviceDuration: 30 },
      { name: "Teeth Cleaning", price: 100, category: "Hygiene", serviceDuration: 45 },
      { name: "Root Canal", price: 500, category: "Surgery", serviceDuration: 90 },
      { name: "Teeth Whitening", price: 300, category: "Esthetics", serviceDuration: 60 },
      { name: "Braces Consultation", price: 150, category: "Consult", serviceDuration: 45 },
      { name: "Tooth Extraction", price: 200, category: "Surgery", serviceDuration: 45 },
      { name: "Dental Filling", price: 150, category: "Procedure", serviceDuration: 30 }
    ],
    "Medical Clinic": [
      { name: "General Checkup", price: 60, category: "Primary Care", serviceDuration: 30 },
      { name: "Blood Test", price: 40, category: "Lab", serviceDuration: 15 },
      { name: "Ultrasound", price: 150, category: "Imaging", serviceDuration: 45 },
      { name: "Specialist Consultation", price: 200, category: "Specialist", serviceDuration: 45 },
      { name: "Vaccination", price: 50, category: "Preventive", serviceDuration: 15 }
    ]
  };

  // Add aliases
  templates["Hair salons / barbershops"] = templates["Barber Shop"];
  templates["Spas & massage therapy"] = templates["Spa Center"];
  templates["Doctors / clinics"] = templates["Medical Clinic"];
  templates["Dentists"] = templates["Dental Clinic"];

  const services = templates[subType];
  if (!services) return;

  const categoryNames = [...new Set(services.map(s => s.category))];
  const categoryMap = {};

  for (const catName of categoryNames) {
    const cat = await prisma.menuCategory.create({
      data: { name: catName, businessId, tenantId }
    });
    categoryMap[catName] = cat.id;
  }

  for (const s of services) {
    await prisma.menuItem.create({
      data: {
        name: s.name,
        price: s.price,
        pricingType: s.pricingType || "FIXED",
        serviceDuration: s.serviceDuration || 30,
        categoryId: categoryMap[s.category],
        businessId,
        tenantId
      }
    });
  }
}
