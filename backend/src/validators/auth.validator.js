const { z } = require("zod");

const registerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    businessName: z.string().min(2),
    businessPhone: z.string().min(7).optional(),
    businessType: z.enum(["APPOINTMENT", "ORDER"]),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

module.exports = { registerSchema, loginSchema };
