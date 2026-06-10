const prisma = require("../config/prisma");
const slotService = require("./slot.service");
const { addMinutes } = require("date-fns");

/**
 * 🚀 PRODUCTION APPOINTMENT SERVICE
 * 
 * Handles all booking logic, validation, and multi-tenant isolation.
 */
class AppointmentService {
  /**
   * Create a new booking with strict validation
   */
  async createBooking(data) {
    const { 
      tenantId, businessId, serviceId, customerName, customerPhone, 
      customerEmail, appointmentTime, staffId, notes, source, callId 
    } = data;

    // 1. Validate Service
    const service = await prisma.appointmentService.findFirst({
      where: { id: serviceId, tenantId, businessId, isActive: true }
    });
    if (!service) throw new Error("Service not found or inactive");

    const duration = service.durationMinutes || service.duration || 30;
    const appointmentEnd = addMinutes(new Date(appointmentTime), duration);

    // 2. Validate Slot Availability
    const isAvailable = await slotService.validateSlot(
      tenantId, businessId, appointmentTime, duration, staffId
    );
    if (!isAvailable) throw new Error("The selected time slot is no longer available");

    // 3. Upsert Customer
    let customerId = null;
    if (customerPhone || customerEmail) {
      const customer = await prisma.customer.upsert({
        where: { 
          tenantId_phone: { tenantId, phone: customerPhone || "none" } 
        },
        update: { name: customerName, email: customerEmail },
        create: { 
          tenantId, 
          name: customerName, 
          phone: customerPhone, 
          email: customerEmail 
        }
      });
      customerId = customer.id;
    }

    // 4. Create Appointment
    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        businessId,
        serviceId,
        customerId,
        staffId,
        callId,
        customerName,
        customerPhone,
        customerEmail,
        appointmentTime: new Date(appointmentTime),
        appointmentEnd,
        durationMinutes: duration,
        status: "CONFIRMED",
        source: source || "DASHBOARD",
        notes
      },
      include: {
        service: true,
        staff: true,
        business: true
      }
    });

    return appointment;
  }

  /**
   * Fetch tenant-specific services
   */
  async getTenantServices(tenantId, businessId) {
    return prisma.appointmentService.findMany({
      where: { tenantId, businessId, isActive: true },
      include: { category: true },
      orderBy: { name: "asc" }
    });
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(tenantId, appointmentId) {
    return prisma.appointment.update({
      where: { id: appointmentId, tenantId },
      data: { status: "CANCELLED" }
    });
  }

  /**
   * Reschedule an appointment
   */
  async reschedule(tenantId, appointmentId, newTime) {
    const existing = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { service: true }
    });
    if (!existing) throw new Error("Appointment not found");

    const isAvailable = await slotService.validateSlot(
      tenantId, existing.businessId, newTime, existing.durationMinutes, existing.staffId
    );
    if (!isAvailable) throw new Error("New time slot is not available");

    return prisma.appointment.update({
      where: { id: appointmentId },
      data: { 
        appointmentTime: new Date(newTime),
        appointmentEnd: addMinutes(new Date(newTime), existing.durationMinutes)
      }
    });
  }
}

module.exports = new AppointmentService();
