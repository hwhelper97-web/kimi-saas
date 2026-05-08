const prisma = require("../../config/prisma");

/* ===============================
   CREATE APPOINTMENT
=============================== */
exports.create = async (req, res) => {
  try {
    const { customerName, customerPhone, serviceName, appointmentTime, businessId, notes, staffId } = req.body;

    if (!customerName || !serviceName || !appointmentTime || !businessId) {
      return res.status(400).json({
        message: "Required fields missing (name, service, time, businessId)"
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

    // Check for existing appointment at same time
    const existingAppt = await prisma.appointment.findFirst({
      where: {
        businessId,
        appointmentTime: new Date(appointmentTime),
        status: { not: "CANCELLED" }
      }
    });

    if (existingAppt) {
      return res.status(400).json({
        message: "This time slot is already booked. Please choose another time."
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        customerName,
        customerPhone,
        serviceName,
        appointmentTime: new Date(appointmentTime),
        notes,
        staffId,
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

    const isSuper = req.user.role === "SUPERADMIN";
    const appointments = await prisma.appointment.findMany({
      where: {
        businessId,
        ...(isSuper ? {} : { tenantId: req.tenantId })
      },
      orderBy: {
        appointmentTime: "asc"
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

/* ===============================
   UPDATE STATUS
=============================== */
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const appointment = await prisma.appointment.update({
      where: { id, tenantId: req.tenantId },
      data: { status }
    });

    res.json({ success: true, data: appointment });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/* ===============================
   DELETE APPOINTMENT
=============================== */
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.appointment.delete({
      where: { id, tenantId: req.tenantId }
    });
    res.json({ success: true, message: "Appointment deleted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};