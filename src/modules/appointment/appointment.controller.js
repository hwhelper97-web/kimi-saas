const prisma = require("../../config/prisma");
const { addMinutes, startOfDay, endOfDay, format } = require("date-fns");
const slotService = require("../../services/slot.service");
const smsService = require("../../services/sms.service");
const appointmentService = require("../../services/appointment.service");

/**
 * 🚀 PRODUCTION-LEVEL APPOINTMENT CONTROLLER
 * 
 * Refactored to use dedicated services for business logic, 
 * ensuring clean architecture and multi-tenant isolation.
 */

/* ===============================
   CREATE APPOINTMENT
=============================== */
exports.create = async (req, res) => {
  try {
    const { 
      customerName, customerPhone, customerEmail, serviceId, 
      appointmentTime, businessId, notes, staffId 
    } = req.body;

    if (!serviceId || !appointmentTime || !businessId) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing (serviceId, appointmentTime, businessId)"
      });
    }

    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN" && businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }

    // Use the Appointment Service to handle creation & validation
    const appointment = await appointmentService.createBooking({
      tenantId,
      businessId,
      serviceId,
      customerName: customerName || "Web Customer",
      customerPhone,
      customerEmail,
      appointmentTime,
      staffId,
      notes,
      source: "DASHBOARD"
    });

    res.status(201).json({
      success: true,
      data: appointment
    });

    // 📱 Background: Send Confirmation SMS
    if (customerPhone && appointment.business) {
      const timeStr = format(new Date(appointmentTime), "hh:mm a, MMM do");
      smsService.sendAppointmentSms(customerPhone, appointment.business.name, appointment.service.name, timeStr);
    }

  } catch (error) {
    console.error("[AppointmentController] Create Error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/* ===============================
   GET APPOINTMENTS
=============================== */
exports.list = async (req, res) => {
  try {
    const { businessId, date } = req.query;

    if (!businessId) {
      return res.status(400).json({ message: "businessId is required" });
    }

    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN" && businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }

    const where = {
      businessId,
      tenantId
    };

    if (date) {
      const d = new Date(date);
      where.appointmentTime = {
        gte: startOfDay(d),
        lte: endOfDay(d)
      };
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        service: true,
        staff: true,
        customer: true
      },
      orderBy: {
        appointmentTime: "desc"
      }
    });

    res.json({
      success: true,
      data: appointments
    });

  } catch (error) {
    console.error("[AppointmentController] List Error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

/* ===============================
   GET BY ID
=============================== */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await prisma.appointment.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { 
        service: true, 
        staff: true, 
        customer: true,
        business: true 
      }
    });

    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    res.json({ success: true, data: appointment });
  } catch (error) {
    res.status(400).json({ message: error.message });
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
      data: { status },
      include: { 
        business: true,
        service: true 
      }
    });

    // 📱 Background: Send Notification on cancellation
    if (status === "CANCELLED" && appointment.customerPhone) {
      const timeStr = format(new Date(appointment.appointmentTime), "hh:mm a, MMM do");
      smsService.sendCancellationSms(appointment.customerPhone, appointment.business.name, appointment.service?.name || "Service", timeStr);
    }

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

/* ===============================
   SLOT ENGINE INTEGRATION
=============================== */
exports.getSlots = async (req, res) => {
  try {
    const { date, businessId, serviceId, staffId } = req.query;

    if (!date || !businessId) {
      return res.status(400).json({ message: "date and businessId are required" });
    }

    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN" && businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }

    const slots = await slotService.getSlotsForDate(
      tenantId, 
      businessId, 
      date, 
      serviceId, 
      staffId
    );

    res.json({
      success: true,
      data: slots
    });
  } catch (error) {
    console.error("[AppointmentController] Slots Error:", error.message);
    res.status(400).json({ message: error.message });
  }
};