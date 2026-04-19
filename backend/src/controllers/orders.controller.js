const prisma = require("../config/prisma");

async function createOrder(req, res) {
  const { customer, email, items } = req.body;
  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });

  const total = items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    return sum + (product?.price || 0) * item.quantity;
  }, 0);

  const order = await prisma.order.create({
    data: {
      customer,
      email,
      total,
      orderItems: {
        create: items.map((item) => {
          const product = products.find((p) => p.id === item.productId);
          return {
            productId: item.productId,
            quantity: item.quantity,
            price: product?.price || 0
          };
        })
      }
    },
    include: { orderItems: true }
  });

  return res.status(201).json(order);
}

async function listOrders(_req, res) {
  const orders = await prisma.order.findMany({ include: { orderItems: true }, orderBy: { createdAt: "desc" } });
  return res.json(orders);
}

async function updateOrderStatus(req, res) {
  const order = await prisma.order.update({ where: { id: req.params.id }, data: { status: req.body.status } });
  return res.json(order);
}

module.exports = { createOrder, listOrders, updateOrderStatus };
