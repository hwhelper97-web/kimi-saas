const prisma = require("../../config/prisma");

exports.create = async (req, res) => {
  try {
    const { customerName, total, businessId } = req.body;

    if (!customerName) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required"
      });
    }

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID is required"
      });
    }

    const business = await prisma.business.findFirst({
      where: {
        id: businessId,
        tenantId: req.tenantId
      }
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found"
      });
    }

    const order = await prisma.order.create({
      data: {
        customerName,
        total: total || 0,
        tenantId: req.tenantId,
        businessId,
        notes: req.body.notes || null
      }
    });

    // 🚀 Calculate displayId (#A001 style)
    const displayId = `#A${String(order.orderNumber).padStart(3, '0')}`;
    const orderWithDisplayId = { ...order, displayId };

    // 🚀 Real-time Notification
    const io = req.app.get("io");
    if (io) {
      io.to(businessId).emit("new_order", orderWithDisplayId);
    }

    return res.json({
      success: true,
      data: orderWithDisplayId
    });
  } catch (err) {
    console.error("ORDER CREATE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Order creation failed"
    });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { businessId } = req.query;

    const isSuper = req.user.role === "SUPERADMIN";
    const orders = await prisma.order.findMany({
      where: {
        ...(isSuper ? {} : { tenantId: req.tenantId }),
        ...(businessId ? { businessId } : {})
      },
      include: {
        items: {
          include: {
            menuItem: true
          }
        },
        business: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    // 🚀 Add human-readable displayId (#A001 style) using orderNumber
    const formattedOrders = orders.map(o => ({
      ...o,
      displayId: `#A${String(o.orderNumber).padStart(3, '0')}`
    }));

    return res.json({
      success: true,
      data: formattedOrders
    });
  } catch (err) {
    console.error("ORDER FETCH ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders"
    });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const isSuper = req.user.role === "SUPERADMIN";
    const order = await prisma.order.findFirst({
      where: {
        id,
        ...(isSuper ? {} : { tenantId: req.tenantId })
      },
      include: {
        items: {
          include: {
            menuItem: true
          }
        },
        business: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Calculate displayId
    const seq = await prisma.order.count({
      where: { 
        businessId: order.businessId, 
        createdAt: { lte: order.createdAt } 
      }
    });
    
    return res.json({
      success: true,
      data: {
        ...order,
        displayId: `#A${String(seq).padStart(3, '0')}`
      }
    });
  } catch (err) {
    console.error("ORDER DETAIL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details"
    });
  }
};
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    const isSuper = req.user.role === "SUPERADMIN";
    const order = await prisma.order.updateMany({
      where: {
        id,
        ...(isSuper ? {} : { tenantId: req.tenantId })
      },
      data: {
        status: status.toLowerCase()
      }
    });

    if (order.count === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found or access denied"
      });
    }

    return res.json({
      success: true,
      message: `Order status updated to ${status}`
    });
  } catch (err) {
    console.error("ORDER UPDATE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update order status"
    });
  }
};
