const { z } = require("zod");

const menuSchema = z.object({ body: z.object({ name: z.string().min(2), isActive: z.boolean().optional() }) });
const menuItemSchema = z.object({
  body: z.object({
    menuId: z.string(),
    name: z.string().min(2),
    description: z.string().optional(),
    price: z.number().nonnegative(),
    isAvailable: z.boolean().optional(),
  }),
});

const orderSchema = z.object({
  body: z.object({
    customerName: z.string().min(2),
    customerPhone: z.string().min(7),
    orderType: z.enum(["PICKUP", "DELIVERY"]),
    deliveryAddress: z.string().optional(),
    specialInstructions: z.string().optional(),
    totalAmount: z.number().nonnegative(),
    itemsJson: z.array(z.object({ id: z.string(), qty: z.number().int().positive() })),
  }),
});

const updateOrderSchema = z.object({ body: z.object({ status: z.enum(["NEW", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELED"]) }) });

module.exports = { menuSchema, menuItemSchema, orderSchema, updateOrderSchema };
