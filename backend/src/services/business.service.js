const prisma = require("../config/prisma");

async function getBusiness(businessId) {
  return prisma.business.findUnique({
    where: { id: businessId },
    include: { aiSettings: true },
  });
}

async function updateBusiness(businessId, payload) {
  return prisma.business.update({
    where: { id: businessId },
    data: payload,
  });
}

module.exports = { getBusiness, updateBusiness };
