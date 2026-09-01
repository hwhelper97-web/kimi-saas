const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const fs = require("fs");

// Global BigInt Serialization Fix
BigInt.prototype.toJSON = function() { return this.toString() };
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const authRoutes = require("./modules/auth/auth.routes");
const superadminRoutes = require("./modules/superadmin/superadmin.routes");
const businessRoutes = require("./modules/business/business.routes");
const menuRoutes = require("./modules/menu/menu.routes");
const orderRoutes = require("./modules/order/order.routes");
const integrationRoutes = require("./modules/integrations/ui/integrations.routes");
const developerRoutes = require("./modules/developer/developer.routes");
const supportAgentRoutes = require("./modules/support-agent/support-agent.routes");
const supportManagerRoutes = require("./modules/support-manager/support-manager.routes");
const productManagerRoutes = require("./modules/product-manager/product-manager.routes");
const appointmentRoutes = require("./modules/appointment/appointment.routes");
const servicesRoutes = require("./modules/appointment/services.routes");
const demoRoutes = require("./modules/demo/demo.routes");

const authMiddleware = require("./middleware/auth.middleware");
const { allowRoles } = require("./middleware/role.middleware");
const { ROLES } = require("./constants/roles");

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "../public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Global Platform Middleware
app.use((req, res, next) => {
  const configPath = path.join(__dirname, "config/platform.json");
  let config = { projectName: "Naxton Technologies", logoUrl: null };
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (e) {}
  }
  res.locals.platformLogo = config.logoUrl;
  res.locals.landingLogo = config.landingLogoUrl || "/logo.svg";
  res.locals.projectName = config.projectName;
  next();
});

// Domain-aware Routing for Root and App Subdomain
app.get("/", (req, res) => {
  const host = req.get("host") || "";
  if (host.startsWith("app.")) {
    return res.redirect("/login");
  }
  res.render("landing");
});

// Admin dashboard – render the full UI (admin-dashboard-apex)
app.get("/admin", authMiddleware, allowRoles(ROLES.OWNER, ROLES.STAFF, ROLES.SUPERADMIN, ROLES.DEVELOPER, ROLES.AGENT, ROLES.MANAGER, ROLES.PRODUCT), (req, res) => {
  return res.render("admin-dashboard-apex");
});

app.get("/superadmin", authMiddleware, allowRoles(ROLES.SUPERADMIN), (req, res) => {
  res.render("superadmin-dashboard");
});

app.get("/superadmin/terminal", authMiddleware, allowRoles(ROLES.SUPERADMIN), (req, res) => {
  res.render("superadmin-terminal");
});

app.get("/superadmin/demos", authMiddleware, allowRoles(ROLES.SUPERADMIN), (req, res) => {
  res.render("admin-demo-center");
});

app.get("/login", (req, res) => {
  res.render("login");
});

// Logout route - clear cookies and redirect
app.get("/logout", (req, res) => {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  res.redirect("/login");
});

// Alias routes for Superadmin Login
app.get(["/superadminlogin", "/superadmin/login"], (req, res) => {
  res.render("login");
});

// Password Reset Page (Renders login view which handles the token)
app.get("/auth/reset-password", (req, res) => {
  res.render("login");
});

app.get("/support", authMiddleware, (req, res) => {
  if (req.user.role === "SUPERADMIN") {
    return res.redirect("/admin/support");
  }
  res.render("support-center", { user: req.user });
});

app.get("/admin/support", authMiddleware, (req, res) => {
  if (req.user.role !== "SUPERADMIN") return res.status(403).send("Forbidden: SuperAdmin access only");
  res.render("support-inbox", { user: req.user });
});

app.get("/support/chat/:id", authMiddleware, (req, res) => {
  res.render("tenant-chat", { user: req.user, conversationId: req.params.id });
});

app.get("/support/ticket/new", authMiddleware, (req, res) => res.render("create-ticket", { user: req.user }));

// 📊 Piece-by-Piece Global Observability Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const userEmail = req.user ? req.user.email : 'anonymous';
    const tenantId = req.tenantId || 'none';
    const businessId = (req.query && req.query.businessId) || (req.body && req.body.businessId) || req.businessId || 'none';
    if (!req.originalUrl.includes("live-calls")) {
      console.log(`[NETWORK_TRACE] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | User: ${userEmail} | Tenant: ${tenantId} | Business: ${businessId} | Duration: ${duration}ms`);
    }
  });
  next();
});

// Serve Uploads
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/appointment", appointmentRoutes);
app.use("/api/services", servicesRoutes);

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected route", user: req.user });
});

app.use("/api/business", businessRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/call", require("./modules/call/call.routes"));
app.use("/api/phone", require("./modules/phone/phone.routes"));
app.use("/api/upload", require("./routes/upload.routes"));
app.use("/api/superadmin", superadminRoutes);
app.use("/api/billing", require("./modules/billing/billing.routes"));
app.use("/api/webhooks", require("./modules/webhooks/webhooks.routes"));
app.use("/api/support", require("./modules/support/support.routes"));
app.use("/api/knowledge", require("./modules/knowledge/knowledge.routes"));

// 📧 Landing Page Consultation & Contact Form Dispatch Endpoint
app.post("/api/contact/submit", async (req, res) => {
  try {
    const { fullName, companyName, email, architectureFocus, details } = req.body;
    if (!fullName || !email) {
      return res.status(400).json({ success: false, error: "Full Name and Email address are required." });
    }

    const emailService = require("./services/email.service");
    await emailService.sendContactFormEmail({ fullName, companyName, email, architectureFocus, details });

    return res.json({
      success: true,
      ticketId: `NX-${Math.floor(10000 + Math.random() * 90000)}`,
      message: "Consultation request received! Our enterprise team will contact you within 24 hours."
    });
  } catch (err) {
    console.error("[CONTACT_API_ERR]", err);
    return res.status(500).json({ success: false, error: "Unable to submit consultation request." });
  }
});
app.use("/developer", developerRoutes);
app.use("/agent", supportAgentRoutes);
app.use("/manager", supportManagerRoutes);
app.use("/product", productManagerRoutes);

app.get("/dev", authMiddleware, (req, res) => {
  if (req.user.role !== "DEVELOPER" && req.user.role !== "SUPERADMIN") {
    return res.status(403).send("Forbidden");
  }
  res.redirect("/developer/dashboard");
});

app.get("/support-agent", authMiddleware, (req, res) => {
  if (req.user.role !== "AGENT" && req.user.role !== "SUPERADMIN") {
    return res.status(403).send("Forbidden");
  }
  res.redirect("/agent/dashboard");
});

app.get("/support-manager", authMiddleware, (req, res) => {
  if (req.user.role !== "MANAGER" && req.user.role !== "SUPERADMIN") {
    return res.status(403).send("Forbidden");
  }
  res.redirect("/manager/dashboard");
});

app.get("/product-manager", authMiddleware, (req, res) => {
  if (req.user.role !== "PRODUCT" && req.user.role !== "SUPERADMIN") {
    return res.status(403).send("Forbidden");
  }
  res.redirect("/product/dashboard");
});

// Live AI Demo Center Routes
app.use(demoRoutes);

// Public Menu Access
app.use("/", require("./modules/public/public.routes"));

// Public Platform Settings
app.get("/api/platform/settings", (req, res) => {
  const fs = require("fs");
  const configPath = path.join(__dirname, "config/platform.json");
  let config = { projectName: "Naxton Technologies", logoUrl: null };
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (e) {}
  }
  res.json({ success: true, data: config });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

module.exports = app;
