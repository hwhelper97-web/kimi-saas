const prisma = require("../../config/prisma");

exports.getAnalytics = async (tenantId, businessId = null, role = "OWNER") => {
  try {
    console.log(`[DashboardService] Fetching analytics. Tenant: ${tenantId}, Business: ${businessId}, Role: ${role}`);
    
    // 🛡️ Guard: Resolve where clause safely
    let where = {};
    if (role === "SUPERADMIN") {
      // SuperAdmins see everything or filter strictly by business
      where = businessId ? { businessId } : {};
    } else {
      // Regular users are locked to their tenant
      where = businessId ? { tenantId, businessId } : { tenantId };
    }

    // 1. Fetch all necessary data with relations
    const [
      totalCalls, 
      revenueData, 
      minuteData, 
      totalOrders, 
      totalAppointments, 
      services, 
      orders, 
      appointments, 
      calls, 
      tenant
    ] = await Promise.all([
      prisma.call.count({ where }),
      prisma.order.aggregate({ where, _sum: { total: true } }),
      prisma.call.aggregate({ where, _sum: { duration: true } }),
      prisma.order.count({ where }),
      prisma.appointment.count({ where }),
      prisma.appointmentService.findMany({ 
        where: businessId ? { businessId } : (tenantId ? { tenantId } : {}) 
      }),
      prisma.order.findMany({
        where,
        select: { total: true, createdAt: true, items: { include: { menuItem: true } } }
      }),
      prisma.appointment.findMany({
        where,
        select: { createdAt: true, customerName: true, status: true, service: { select: { name: true, price: true } } }
      }),
      prisma.call.findMany({ where, select: { createdAt: true } }),
      tenantId ? prisma.tenant.findUnique({ where: { id: tenantId } }) : Promise.resolve(null)
    ]);

    // 🛡️ Guard: Build price map with fallbacks
    const servicePriceMap = {};
    if (Array.isArray(services)) {
      services.forEach(s => {
        if (s.name) servicePriceMap[s.name] = s.price || 0;
      });
    }

    // 2. Calculate Revenue
    let totalRevenue = revenueData?._sum?.total || 0;
    const revenueMap = {};
    const businessTz = tenant?.business?.timezone || "UTC"; // Fallback to tenant timezone if available, else UTC

    const formatInTz = (date, tz) => {
      try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      } catch (e) {
        return date.toISOString().split("T")[0];
      }
    };

    // Add Order Revenue
    if (Array.isArray(orders)) {
      orders.forEach((order) => {
        if (!order.createdAt) return;
        const date = formatInTz(order.createdAt, businessTz);
        const amount = order.total || 0;
        revenueMap[date] = (revenueMap[date] || 0) + amount;
      });
    }

    // Add Appointment Revenue (Only if confirmed/completed)
    if (Array.isArray(appointments)) {
      appointments.forEach((appt) => {
        if (!appt.createdAt) return;
        
        // Priority: Use the price from the linked service at time of booking if available, else fallback
        const price = appt.service?.price || servicePriceMap[appt.service?.name] || 0;
        
        if (appt.status !== 'CANCELLED' && appt.status !== 'REJECTED') {
          totalRevenue += price;
          const date = formatInTz(appt.createdAt, businessTz);
          revenueMap[date] = (revenueMap[date] || 0) + price;
        }
      });
    }

    // 🛡️ Final Revenue Validation
    if (isNaN(totalRevenue)) totalRevenue = 0;

    const totalConversions = totalOrders + totalAppointments;
    const totalMinutes = Math.ceil((minuteData?._sum?.duration || 0) / 60);

    const averageCallDuration = totalCalls > 0
      ? Math.round((minuteData?._sum?.duration || 0) / totalCalls)
      : 0;

    const conversionRate = totalCalls > 0
      ? ((totalConversions / totalCalls) * 100).toFixed(1)
      : "0";

    // 📉 3. Build Charts (Last 7 Days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split("T")[0]);
    }

    const revenueChart = {
      labels: last7Days,
      values: last7Days.map(d => revenueMap[d] || 0)
    };

    const callsMap = {};
    if (Array.isArray(calls)) {
      calls.forEach((call) => {
        if (!call.createdAt) return;
        const date = call.createdAt.toISOString().split("T")[0];
        callsMap[date] = (callsMap[date] || 0) + 1;
      });
    }

    const callsChart = {
      labels: last7Days,
      values: last7Days.map(d => callsMap[d] || 0)
    };

    const topItemsMap = new Map();

    // Process Orders for top items
    if (Array.isArray(orders)) {
      for (const order of orders) {
        if (!order.items) continue;
        for (const item of order.items) {
          const itemName = item.menuItem?.name || "Unknown Item";
          const current = topItemsMap.get(itemName) || { name: itemName, totalSold: 0, revenue: 0 };
          current.totalSold += item.quantity || 0;
          current.revenue += (item.unitPrice || item.menuItem?.price || 0) * (item.quantity || 0);
          topItemsMap.set(itemName, current);
        }
      }
    }

    // Process Appointments for top items
    if (Array.isArray(appointments)) {
      for (const appt of appointments) {
        if (appt.status === 'CANCELLED' || appt.status === 'REJECTED') continue;
        const serviceName = appt.service?.name || "Unknown Service";
        const price = appt.service?.price || servicePriceMap[serviceName] || 0;
        const current = topItemsMap.get(serviceName) || { name: serviceName, totalSold: 0, revenue: 0 };
        current.totalSold += 1;
        current.revenue += price;
        topItemsMap.set(serviceName, current);
      }
    }

    const top5 = Array.from(topItemsMap.values())
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 5);

    const averageRevenuePerCall = totalCalls > 0 ? (totalRevenue / totalCalls).toFixed(2) : "0.00";
    const aiSuccessRate = totalCalls > 0 ? ((totalConversions / totalCalls) * 100).toFixed(1) : "0";
    const missedOrders = totalCalls > totalConversions ? totalCalls - totalConversions : 0;
    const avgOrderValue = totalConversions > 0 ? (totalRevenue / totalConversions).toFixed(2) : "0.00";

    return {
      totals: {
        totalCalls,
        totalOrders,
        totalAppointments,
        totalConversions,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalMinutes,
        averageCallDuration,
        conversionRate: Number(conversionRate),
        averageRevenuePerCall: Number(averageRevenuePerCall),
        aiSuccessRate: Number(aiSuccessRate),
        missedOrders,
        avgOrderValue: Number(avgOrderValue)
      },
      charts: {
        revenueChart,
        callsChart
      },
      topItems: top5,
      tenant
    };
  } catch (error) {
    console.error("[DashboardService] Critical Error:", error);
    throw error; // Re-throw to be caught by controller
  }
};
