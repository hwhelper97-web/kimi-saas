const express = require("express");
const router = express.Router();

const controller = require("./auth.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");
const { ROLES } = require("../../constants/roles");
const { tenantMiddleware } = require("../../middleware/tenant.middleware");
const { billingGuard, checkResourceLimit } = require("../../middleware/billing.middleware");
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

// Forgot password (request token)
router.post("/forgot-password", controller.forgotPassword);

// Reset password with token (public)
router.post("/reset-password-with-token", controller.resetPasswordWithToken);



/* =====================================================
   PROTECTED ROUTES
===================================================== */

// Get staff (OWNER only)
router.get(
  "/staff",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
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
  billingGuard,
  checkResourceLimit("STAFF"),
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.createStaff
);

// Update theme (logged-in users)
router.post(
  "/update-theme",
  authMiddleware,
  tenantMiddleware,
  controller.updateTheme
);

// Update staff (OWNER only)
router.put(
  "/staff/:id",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.updateStaff
);

// Delete staff (OWNER only)
router.delete(
  "/staff/:id",
  authMiddleware,
  tenantMiddleware,
  allowRoles(ROLES.OWNER, ROLES.SUPERADMIN),
  controller.deleteStaff
);

module.exports = router;
