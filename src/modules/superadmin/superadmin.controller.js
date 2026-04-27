
const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");

/* ======================================
   GET ALL TENANTS
====================================== */
exports.getTenants = async (req, res) => {
  try {

    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" }
    });

    res.json({
      success: true,
      data: tenants
    });

  } catch (error) {

    console.error("Load tenants error:", error);

    res.json({
      success: false,
      message: "Failed to load tenants"
    });

  }
};

/* ======================================
   CREATE NEW TENANT
====================================== */
exports.createTenant = async (req, res) => {
  try {

    const { tenantName, email, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    const tenant = await prisma.tenant.create({
      data: {
        name: tenantName,
        users: {
          create: {
            email,
            password: hashed,
            role: "admin"
          }
        }
      }
    });

    res.json({
      success: true,
      data: tenant
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
   PLATFORM ANALYTICS
====================================== */
exports.getAnalytics = async (req, res) => {
  try {

    const totalTenants = await prisma.tenant.count();
    const totalUsers = await prisma.user.count();
    const totalOrders = await prisma.order.count();
    const totalCalls = await prisma.call.count();

    /* ------------------------------
       TODAY'S CALLS
    ------------------------------ */

    const today = new Date();
    today.setHours(0,0,0,0);

    const callsToday = await prisma.call.count({
      where: {
        createdAt: {
          gte: today
        }
      }
    });

    const ordersToday = await prisma.order.count({
      where: {
        createdAt: {
          gte: today
        }
      }
    });

    /* ------------------------------
       AVG CALL DURATION
    ------------------------------ */

    const avgDuration = await prisma.call.aggregate({
      _avg: {
        duration: true
      }
    });

    /* ------------------------------
       CONVERSION RATE
    ------------------------------ */

    const conversionRate = totalCalls
  ? ((totalOrders / totalCalls) * 100).toFixed(1)
  : 0;


/* ------------------------------
   REVENUE CHART DATA
------------------------------ */

const orders = await prisma.order.findMany({
  select:{
    totalPrice:true,
    createdAt:true
  }
});

const revenueMap = {};

orders.forEach(o => {

  const date = o.createdAt.toISOString().split("T")[0];

  if(!revenueMap[date]){
    revenueMap[date] = 0;
  }

  revenueMap[date] += o.totalPrice || 0;

});


/* ------------------------------
   CALLS CHART DATA
------------------------------ */

const calls = await prisma.call.findMany({
  select:{ createdAt:true }
});

const callsMap = {};

calls.forEach(c => {

  const date = c.createdAt.toISOString().split("T")[0];

  if(!callsMap[date]){
    callsMap[date] = 0;
  }

  callsMap[date] += 1;

});




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
  conversionRate
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
      data: calls
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

    const calls = await prisma.call.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        business: true
      }
    });

    res.json({
      success: true,
      data: calls
    });

  } catch (error) {

    console.error("Transcript fetch error:", error);

    res.json({
      success: false,
      message: "Failed to load transcripts"
    });

  }
};


/* ======================================
   PLATFORM ACTIVITY FEED
====================================== */
exports.getActivityFeed = async (req, res) => {
  try {

    const calls = await prisma.call.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        business: true
      }
    });

    const activities = calls.map(call => ({
      restaurant: call.business?.name || "Unknown",
      duration: call.duration || 0,
      tokens: call.tokensUsed || 0,
      createdAt: call.createdAt
    }));

    res.json({
      success: true,
      data: activities
    });

  } catch (error) {

    console.error("Activity feed error:", error);

    res.json({
      success: false,
      message: "Failed to load activity feed"
    });

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
        return sum + (o.totalPrice || 0);
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

      const revenueToday = ordersToday.reduce((sum, o) =>
        sum + (o.totalPrice || 0), 0);

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
        items: true
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

      restaurantMap[name] += o.totalPrice || 0;
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

        const name = i.name;

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
