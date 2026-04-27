const prisma = require("../../config/prisma");

/* ===============================
   CREATE APPOINTMENT
=============================== */
exports.create = async (req, res) => {
  try {
    const { customerName, serviceName, date, businessId } = req.body;

    if (!customerName || !serviceName || !date || !businessId) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    // 🔒 verify business
    const business = await prisma.business.findFirst({
      where: {
        id: businessId,
        tenantId: req.tenantId
      }
    });

    if (!business) {
      return res.status(403).json({
        message: "Invalid business"
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        customerName,
        serviceName,
        date: new Date(date),
        businessId,
        tenantId: req.tenantId
      }
    });

    res.status(201).json({
      success: true,
      data: appointment
    });

  } catch (error) {
    console.error("APPOINTMENT ERROR:", error);

    res.status(400).json({
      message: error.message
    });
  }
};


/* ===============================
   GET APPOINTMENTS
=============================== */
exports.list = async (req, res) => {
  try {
    const { businessId } = req.query;

    if (!businessId) {
      return res.status(400).json({
        message: "businessId is required"
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        tenantId: req.tenantId,
        businessId
      },
      orderBy: {
        date: "asc"
      }
    });

    res.json({
      success: true,
      data: appointments
    });

  } catch (error) {
    console.error("GET APPOINTMENTS ERROR:", error);

    res.status(400).json({
      message: error.message
    });
  }
};