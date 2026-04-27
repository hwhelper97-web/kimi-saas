const prisma = require("../../config/prisma");

exports.getAnalytics = async (tenantId, businessId = null, role = "OWNER") => {
  // Single where clause used for both calls and orders
  const where = role === "SUPERADMIN" 
    ? (businessId ? { businessId } : {}) 
    : (businessId ? { tenantId, businessId } : { tenantId });

  const totalCalls = await prisma.call.count({ where });

  const totalOrders = await prisma.order.count({ where });

  const revenueData = await prisma.order.aggregate({
    where,
    _sum: { total: true },
  });

  const minuteData = await prisma.call.aggregate({
    where,
    _sum: { duration: true },
  });

  const totalRevenue = revenueData._sum.total || 0;
  const totalMinutes = Math.ceil((minuteData._sum.duration || 0) / 60);

  const averageCallDuration = totalCalls > 0
    ? Math.round((minuteData._sum.duration || 0) / totalCalls)
    : 0;

  const conversionRate = totalCalls > 0
    ? ((totalOrders / totalCalls) * 100).toFixed(1)
    : 0;

  const orders = await prisma.order.findMany({
    where,
    select: {
      total: true,
      createdAt: true,
      items: { include: { menuItem: true } },
    },
  });

  const revenueMap = {};

  orders.forEach((order) => {
    const date = order.createdAt.toISOString().split("T")[0];
    revenueMap[date] = (revenueMap[date] || 0) + order.total;
  });

  const revenueChart = {
    labels: Object.keys(revenueMap),
    values: Object.values(revenueMap)
  };

  const calls = await prisma.call.findMany({
    where,
    select: { createdAt: true },
  });

  const callsMap = {};

  calls.forEach((call) => {
    const date = call.createdAt.toISOString().split("T")[0];
    callsMap[date] = (callsMap[date] || 0) + 1;
  });

  const callsChart = {
    labels: Object.keys(callsMap),
    values: Object.values(callsMap)
  };

  const topItemsMap = new Map();

  for (const order of orders) {
    for (const item of order.items) {
      const itemName = item.menuItem?.name || "Unknown item";
      const current = topItemsMap.get(itemName) || {
        name: itemName,
        totalSold: 0,
        revenue: 0
      };

      current.totalSold += item.quantity || 0;
      current.revenue += (item.unitPrice || item.menuItem?.price || 0) * (item.quantity || 0);
      topItemsMap.set(itemName, current);
    }
  }

  const top5 = Array.from(topItemsMap.values())
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, 5);

  const averageRevenuePerCall = totalCalls > 0
    ? (totalRevenue / totalCalls).toFixed(2)
    : 0;

  const aiSuccessRate = totalCalls > 0
    ? ((totalOrders / totalCalls) * 100).toFixed(1)
    : 0;

  const missedOrders = totalCalls > totalOrders
    ? totalCalls - totalOrders
    : 0;

  const avgOrderValue = totalOrders > 0
    ? (totalRevenue / totalOrders).toFixed(2)
    : 0;

  return {
    totals: {
      totalCalls,
      totalOrders,
      totalRevenue,
      totalMinutes,
      averageCallDuration,
      conversionRate,
      averageRevenuePerCall,
      aiSuccessRate,
      missedOrders,
      avgOrderValue
    },
    charts: {
      revenueChart,
      callsChart
    },
    topItems: top5
  };
};
