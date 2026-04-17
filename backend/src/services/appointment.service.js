const prisma = require("../config/prisma");

const createAppointment = (businessId, payload) =>
  prisma.appointment.create({ data: { ...payload, businessId } });

const listAvailability = (businessId) =>
  prisma.timeSlot.findMany({ where: { businessId, isEnabled: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });

const upsertSlot = async (businessId, payload) => {
  if (payload.id) {
    return prisma.timeSlot.update({ where: { id: payload.id }, data: payload });
  }
  return prisma.timeSlot.create({ data: { ...payload, businessId } });
};

module.exports = { createAppointment, listAvailability, upsertSlot };
