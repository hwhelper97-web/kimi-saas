const appointmentService = require("./appointment.service");
const slotService = require("./slot.service");
const prisma = require("../config/prisma");
const { format } = require("date-fns");

/**
 * 🤖 AI TOOL SERVICE
 * 
 * High-performance, structured JSON tools for AI Agents (ElevenLabs / OpenAI).
 * All tools include tenant isolation and robust error handling.
 */
class AiToolService {
  /**
   * Fetch all active services for a business
   */
  async getBusinessServices(businessId, tenantId) {
    try {
      const services = await appointmentService.getTenantServices(tenantId, businessId);
      return {
        success: true,
        services: services.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          duration: s.durationMinutes || s.duration,
          price: s.price,
          category: s.category?.name
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch restaurant menu categories and items for the business
   */
  async getBusinessMenu(businessId) {
    try {
      const categories = await prisma.menuCategory.findMany({
        where: { businessId, isActive: true },
        include: { items: { where: { isAvailable: true } } }
      });
      return {
        success: true,
        menu: categories.map(cat => ({
          category: cat.name,
          description: cat.description,
          items: cat.items.map(i => ({
            id: i.id,
            name: i.name,
            price: i.price,
            description: i.description
          }))
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get available slots for a specific service and date
   */
  async getAvailableSlots(businessId, tenantId, serviceId, date) {
    try {
      console.log(`[AiToolService] getAvailableSlots - Biz: ${businessId}, Tenant: ${tenantId}, Service: ${serviceId}, Date: ${date}`);
      const slots = await slotService.getAvailableSlots(tenantId, businessId, date, serviceId);
      const available = slots.filter(s => s.available);
      
      if (available.length === 0) {
        return { success: true, message: "No slots available for this date.", slots: [] };
      }

      return {
        success: true,
        date,
        slots: available.map(s => ({
          time: s.time,
          iso: s.iso
        }))
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Create an appointment from AI context
   */
  async bookAppointment(params) {
    try {
      const { 
        tenantId, businessId, serviceId, customerName, 
        customerPhone, appointmentTime, notes, callId 
      } = params;

      const booking = await appointmentService.createBooking({
        tenantId,
        businessId,
        serviceId,
        customerName,
        customerPhone,
        appointmentTime,
        source: "AI",
        callId,
        notes
      });

      return {
        success: true,
        message: "Appointment confirmed successfully",
        booking: booking,
        summary: `${booking.service?.name || 'Service'} confirmed for ${booking.customerName} on ${format(new Date(booking.appointmentTime), "PPPP 'at' p")}`
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Find a customer by phone
   */
  async getCustomerInfo(tenantId, phone) {
    try {
      const customer = await prisma.customer.findFirst({
        where: { tenantId, phone },
        include: { 
          appointments: {
            where: { appointmentTime: { gte: new Date() } },
            take: 1,
            orderBy: { appointmentTime: 'asc' },
            include: { service: true }
          }
        }
      });

      if (!customer) return { success: false, message: "Customer not found" };

      return {
        success: true,
        name: customer.name,
        existingAppointment: customer.appointments[0] ? {
          id: customer.appointments[0].id,
          time: customer.appointments[0].appointmentTime,
          service: customer.appointments[0].service?.name || "General Service"
        } : null
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = new AiToolService();
