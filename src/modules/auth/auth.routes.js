const express = require("express");
const router = express.Router();

const controller = require("./auth.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");
const rateLimit = require("express-rate-limit");

/* =====================================================
   RATE LIMITER (Login Protection)
===================================================== */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 login attempts for development
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Try again later."
  }
});

/* =====================================================
   PUBLIC ROUTES
===================================================== */

// Register new tenant + admin
router.post("/register", controller.register);

// Login (Rate Limited)
router.post("/login", loginLimiter, controller.login);

// Refresh access token
router.post("/refresh", controller.refreshToken);

// Forgot password (basic MVP)
router.post("/forgot-password", controller.forgotPassword);



/* =====================================================
   PROTECTED ROUTES
===================================================== */

// Get staff (OWNER only)
router.get(
  "/staff",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER),
  controller.getStaff
);

// Reset password (logged-in users)
router.post(
  "/reset-password",
  authMiddleware,
  tenantMiddleware,
  controller.resetPassword
);

// Create staff (OWNER only)
router.post(
  "/create-staff",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER),
  controller.createStaff
);

module.exports = router;