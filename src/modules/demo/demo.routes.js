const express = require("express");
const router = express.Router();
const controller = require("./demo.controller");
const rateLimit = require("express-rate-limit");

const demoCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: "Too many demo creation requests. Please try again in a few minutes." }
});

// UI Views
router.get("/demo", controller.renderSetupWizard);
router.get("/demo/live/:token", controller.renderLiveDashboard);

// API Endpoints
router.post("/api/demo/create", demoCreateLimiter, controller.createDemo);
router.post("/api/demo/waitlist", controller.joinWaitlist);
router.post("/api/demo/become-customer", controller.submitBecomeCustomer);
router.get("/api/demo/session/:token", controller.getSessionState);
router.get("/api/demo/session/:token/calls", controller.getDemoCalls);
router.get("/api/demo/session/:token/orders", controller.getDemoOrders);
router.get("/api/demo/session/:token/appointments", controller.getDemoAppointments);
router.post("/api/demo/session/:token/deactivate", controller.deactivateDemo);

module.exports = router;
