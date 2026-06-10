const prisma = require("../config/prisma");
const { addMinutes, format, startOfDay, endOfDay, isBefore, isEqual } = require("date-fns");

/**
 * 🚀 PRODUCTION-LEVEL SLOT GENERATION ENGINE
 * 
 * Features:
 * 1. Multi-Tenant Isolated Queries
 * 2. ID-based Service & Staff Lookup
 * 3. Business Hours & Break Time Support
 * 4. Staff-Specific Availability & Blocked Times
 * 5. Timezone Awareness (via date-fns and business config)
 * 6. Optimized Queries with proper includes
 */
class SlotService {
  /**
   * Generates all slots for a given date, including status (Available vs Booked).
   */
  async getSlotsForDate(tenantId, businessId, dateStr, serviceId = null, staffId = null) {
    try {
      // 1. Fetch Business Context
      const business = await prisma.business.findFirst({
        where: { id: businessId, tenantId },
        include: {
          blockedTimes: {
            where: {
              OR: [
                { startTime: { gte: new Date(dateStr), lte: new Date(`${dateStr}T23:59:59`) } },
                { isRecurring: true }
              ]
            }
          },
          staff: { 
            where: { isActive: true, ...(staffId ? { id: staffId } : {}) },
            include: { 
              services: true 
            }
          }
        }
      });

      if (!business) throw new Error("Business not found or access denied");

      // 2. Resolve Service Duration and Buffer
      let duration = business.appointmentDuration || 30;
      let buffer = business.bufferTime || 0;
      let serviceName = "General Booking";

      if (serviceId) {
        const service = await prisma.appointmentService.findFirst({
          where: { id: serviceId, tenantId }
        });
        if (service) {
          duration = service.durationMinutes || service.duration || duration;
          buffer = service.bufferMinutes || buffer;
          serviceName = service.name;
        }
      }

      const slotInterval = business.slotInterval || duration;

      // 3. Setup Day Window
      if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes("-")) {
        console.error(`[SlotService] Invalid date format received: "${dateStr}"`);
        throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
      }

      console.log(`[SlotService] Generating slots for ${dateStr} (Service: ${serviceId}, Timezone: ${business.timezone || 'UTC'})`);
      
      // 🚀 TIMEZONE-AWARE WINDOW GENERATION
      // Instead of server local time, we construct the day window based on the business's offset
      const constructTzDate = (date, time, tz) => {
        try {
          // If no timezone, fallback to UTC
          if (!tz) return new Date(`${date}T${time}:00Z`);
          
          // Use Intl to get the offset for the business timezone
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            timeZoneName: 'shortOffset'
          });
          const parts = formatter.formatToParts(new Date(`${date}T${time}:00Z`));
          const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
          
          // Example: 'GMT+5' -> '+05:00'
          let offset = offsetPart.replace('GMT', '');
          if (!offset) offset = '+00:00';
          else if (offset.length === 2) offset = offset[0] + '0' + offset[1] + ':00';
          else if (offset.length === 3) offset = offset + ':00';
          
          return new Date(`${date}T${time}:00${offset}`);
        } catch (e) {
          return new Date(`${date}T${time}:00Z`); // Fallback
        }
      };

      const dayStart = constructTzDate(dateStr, business.openTime || "09:00", business.timezone);
      const dayEnd = constructTzDate(dateStr, business.closeTime || "22:00", business.timezone);

      // 4. Build Charts (Last 7 Days)
      const formatTzTime = (date, tz) => {
        try {
          const formatted = new Intl.DateTimeFormat('en-US', {
            timeZone: tz || 'UTC',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }).format(date);
          // console.log(`[SlotService] Formatted ${date.toISOString()} with ${tz} -> ${formatted}`);
          return formatted;
        } catch (e) {
          console.error(`[SlotService] Intl Format Error (${tz}):`, e.message);
          return format(date, "hh:mm a");
        }
      };

      // 5. Fetch Existing Bookings
      const bookings = await prisma.appointment.findMany({
        where: {
          businessId,
          tenantId,
          status: { notIn: ["CANCELLED", "REJECTED"] },
          appointmentTime: {
            gte: startOfDay(dayStart),
            lte: endOfDay(dayStart)
          }
        },
        include: { service: true }
      });

      const slots = [];
      const now = new Date();
      let cursor = new Date(dayStart);

      // 6. Generate Slots
      while (cursor < dayEnd) {
        const slotStart = new Date(cursor);
        const slotEnd = addMinutes(slotStart, duration);

        if (slotEnd > dayEnd) break;

        // Skip past AVAILABLE slots (to prevent retrospective booking),
        // but ALWAYS keep slots that have an actual booking/block.
        const isPast = isBefore(slotStart, now);
        const conflictingBooking = bookings.find(b => {
          const bStart = new Date(b.appointmentTime);
          const bEnd = b.appointmentEnd || addMinutes(bStart, b.durationMinutes || 30);
          return slotStart < bEnd && slotEnd > bStart;
        });

        if (isPast && !conflictingBooking) {
          cursor = addMinutes(cursor, slotInterval);
          continue;
        }

        // Check Business-Level Blocks
        let isBizBlocked = false;
        if (business.breakStartTime && business.breakEndTime) {
          const breakStart = constructTzDate(dateStr, business.breakStartTime, business.timezone);
          const breakEnd = constructTzDate(dateStr, business.breakEndTime, business.timezone);
          if (slotStart < breakEnd && slotEnd > breakStart) isBizBlocked = true;
        }

        if (!isBizBlocked) {
          if (business.blockedTimes.some(bt => !bt.staffId && slotStart < bt.endTime && slotEnd > bt.startTime)) {
            isBizBlocked = true;
          }
        }

        // Check each staff member's availability for this slot
        const staffAvailability = business.staff.map(s => {
          // If a specific service is requested, staff must support it
          if (serviceId && !s.services.some(ss => ss.serviceId === serviceId)) {
            return { staffId: s.id, available: false };
          }

          // Check for booking conflicts
          const isBooked = bookings.some(b => {
            if (b.staffId && b.staffId !== s.id) return false;
            const bStart = b.appointmentTime;
            const bEnd = b.appointmentEnd || addMinutes(bStart, b.durationMinutes);
            return slotStart < bEnd && slotEnd > bStart;
          });

          // Check for staff-specific blocks
          const isBlocked = business.blockedTimes.some(bt => 
            bt.staffId === s.id && slotStart < bt.endTime && slotEnd > bt.startTime
          );

          return { staffId: s.id, available: !isBooked && !isBlocked };
        });

        const availableStaff = staffAvailability.filter(sa => sa.available);

        if (!isBizBlocked && availableStaff.length > 0) {
          slots.push({
            time: formatTzTime(slotStart, business.timezone),
            iso: slotStart.toISOString(),
            status: "AVAILABLE",
            available: true,
            staffId: availableStaff[0].staffId,
            duration,
            serviceName
          });
        } else if (!isBizBlocked) {
          // If it's not available, find the booking that's taking this spot to show in the UI
          const conflictingBooking = bookings.find(b => {
             const bStart = b.appointmentTime;
             const bEnd = b.appointmentEnd || addMinutes(bStart, b.durationMinutes);
             return slotStart < bEnd && slotEnd > bStart;
          });

          if (conflictingBooking) {
            slots.push({
              time: formatTzTime(slotStart, business.timezone),
              iso: slotStart.toISOString(),
              status: conflictingBooking.status || "BOOKED",
              available: false,
              appointmentId: conflictingBooking.id,
              client: conflictingBooking.customerName,
              service: conflictingBooking.service?.name || "General Booking"
            });
          }
        }

        cursor = addMinutes(cursor, slotInterval);
      }

      return slots;
    } catch (err) {
      console.error("[SlotService] Error:", err);
      throw err;
    }
  }

  /**
   * Quick check for a specific slot availability
   */
  async validateSlot(tenantId, businessId, startTime, duration, staffId = null) {
    const slots = await this.getSlotsForDate(tenantId, businessId, format(new Date(startTime), "yyyy-MM-dd"), null, staffId);
    return slots.some(s => s.available && isEqual(new Date(s.iso), new Date(startTime)));
  }
  /**
   * Alias for getSlotsForDate used by AI Tools
   */
  async getAvailableSlots(tenantId, businessId, dateStr, serviceId = null) {
    return this.getSlotsForDate(tenantId, businessId, dateStr, serviceId);
  }
}

module.exports = new SlotService();
