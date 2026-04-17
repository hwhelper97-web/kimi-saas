const service = require("../services/order.service");

async function createMenu(req, res, next) {
  try {
    const menu = await service.createMenu(req.businessId, req.validated.body);
    res.status(201).json(menu);
  } catch (err) {
    next(err);
  }
}

async function listMenus(req, res, next) {
  try {
    res.json(await service.listMenus(req.businessId));
  } catch (err) {
    next(err);
  }
}

async function createMenuItem(req, res, next) {
  try {
    const item = await service.createMenuItem(req.validated.body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

async function createOrder(req, res, next) {
  try {
    const order = await service.createOrder(req.businessId, req.validated.body);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

async function listOrders(req, res, next) {
  try {
    res.json(await service.listOrders(req.businessId));
  } catch (err) {
    next(err);
  }
}

async function updateOrder(req, res, next) {
  try {
    res.json(await service.updateOrder(req.params.orderId, req.validated.body));
  } catch (err) {
    next(err);
  }
}

module.exports = { createMenu, listMenus, createMenuItem, createOrder, listOrders, updateOrder };
