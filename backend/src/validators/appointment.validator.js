const { z } = require("zod");

const createAppointmentSchema = z.object({
  body: z.object({
    customerName: z.string().min(2),
    customerPhone: z.string().min(7),
    customerEmail: z.string().email().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    notes: z.string().optional(),
  }),
});

const slotSchema = z.object({
  body: z.object({
    id: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string(),
    endTime: z.string(),
    capacity: z.number().int().min(1).default(1),
    isEnabled: z.boolean().optional(),
  }),
});

module.exports = { createAppointmentSchema, slotSchema };
