const prisma = require("../config/prisma");

const createMenu = (businessId, payload) => prisma.menu.create({ data: { ...payload, businessId } });
const listMenus = (businessId) => prisma.menu.findMany({ where: { businessId }, include: { items: true } });
const createMenuItem = ({ menuId, ...data }) => prisma.menuItem.create({ data: { ...data, menuId } });

const createOrder = (businessId, payload) => prisma.order.create({ data: { ...payload, businessId } });
const listOrders = (businessId) => prisma.order.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } });
const updateOrder = (id, data) => prisma.order.update({ where: { id }, data });

module.exports = { createMenu, listMenus, createMenuItem, createOrder, listOrders, updateOrder };
