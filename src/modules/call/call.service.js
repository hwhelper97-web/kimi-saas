const prisma = require("../../config/prisma");

exports.handleIncomingCall = async (body) => {
  try {
    let phone = (body.To || body.to || "").replace(/[^0-9]/g, ""); // Strip all non-digits

    if (!phone) {
      throw new Error("Phone number missing");
    }

    // Try to find business by searching for the last 10 digits to be safe
    const searchNumber = phone.length > 10 ? phone.slice(-10) : phone;

    const business = await prisma.business.findFirst({
      where: {
        phoneNumber: {
          contains: searchNumber
        },
      },
      include: {
        menuItems: {
          include: {
            sizes: true,
            optionGroups: {
              include: {
                options: true
              }
            },
            category: true
          }
        },
        tenant: true,
      },
    });

    if (!business) {
      throw new Error("Business not found");
    }

    const call = await prisma.call.create({
      data: {
        businessId: business.id,
        tenantId: business.tenantId,
        fromNumber: body.From || body.from || "unknown",
        toNumber: phone,
        twilioSid: body.CallSid || body.callSid || null,
      },
    });

    return { business, call };
  } catch (error) {
    console.error("CALL SERVICE ERROR:", error);
    throw error;
  }
};
