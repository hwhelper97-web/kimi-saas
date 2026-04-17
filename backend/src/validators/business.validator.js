const { z } = require("zod");

const updateBusinessSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    timezone: z.string().optional(),
    isActive: z.boolean().optional(),
    planType: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
  }),
});

module.exports = { updateBusinessSchema };
