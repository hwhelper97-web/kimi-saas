const prisma = require("../../config/prisma");

exports.createBusiness = async (data, tenantId) => {
  const { name, phoneNumber } = data;

  if (!name || !phoneNumber) {
    throw new Error("Name and phoneNumber are required");
  }

  return prisma.business.create({
    data: {
      name,
      phoneNumber,
      tenantId,
    },
  });
};

exports.getBusinesses = async (tenantId) => {
  return prisma.business.findMany({
    where: { tenantId },
  });
};