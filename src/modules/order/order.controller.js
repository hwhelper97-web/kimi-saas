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
        businessId
      }
    });

    return res.json({
      success: true,
      data: order
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

    const orders = await prisma.order.findMany({
      where: {
        tenantId: req.tenantId,
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

    return res.json({
      success: true,
      data: orders
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

    const order = await prisma.order.findFirst({
      where: {
        id,
        tenantId: req.tenantId
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

    return res.json({
      success: true,
      data: order
    });
  } catch (err) {
    console.error("ORDER DETAIL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details"
    });
  }
};
