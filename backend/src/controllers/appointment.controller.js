const service = require("../services/appointment.service");

async function create(req, res, next) {
  try {
    const item = await service.createAppointment(req.businessId, req.validated.body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

async function availability(req, res, next) {
  try {
    const slots = await service.listAvailability(req.businessId);
    res.json(slots);
  } catch (err) {
    next(err);
  }
}

async function slot(req, res, next) {
  try {
    const result = await service.upsertSlot(req.businessId, req.validated.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, availability, slot };
