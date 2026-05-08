const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");

const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const authRoutes = require("./modules/auth/auth.routes");
const superadminRoutes = require("./modules/superadmin/superadmin.routes");
const businessRoutes = require("./modules/business/business.routes");
const menuRoutes = require("./modules/menu/menu.routes");
const orderRoutes = require("./modules/order/order.routes");
const integrationRoutes = require("./modules/integrations/ui/integrations.routes");

const authMiddleware = require("./middleware/auth.middleware");

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
  const fs = require("fs");
  const configPath = path.join(__dirname, "config/platform.json");
  let config = { projectName: "Nexton Technologies LLC", logoUrl: null };
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (e) {}
  }
  res.locals.platformLogo = config.logoUrl;
  res.locals.projectName = config.projectName;
  next();
});

app.get("/", (req, res) => {
  res.json({ status: "OK", message: "Nexton AI API Running" });
});

// Admin dashboard – render the full UI (admin-dashboard-apex)
app.get("/admin", authMiddleware, (req, res) => {
  return res.render("admin-dashboard-apex");
});

app.get("/superadmin", (req, res) => {
  res.render("superadmin-dashboard");
});

app.get("/login", (req, res) => {
  res.render("login");
});

// Alias routes for Superadmin Login
app.get(["/superadminlogin", "/superadmin/login"], (req, res) => {
  res.render("login");
});

app.get("/support", authMiddleware, (req, res) => {
  if (req.user.role === "SUPERADMIN") {
    return res.redirect("/admin/support");
  }
  // Redirect to their specific chat
  return require("./modules/support/support.controller").getOrCreateConversation(req, res);
});

app.get("/admin/support", authMiddleware, (req, res) => {
  if (req.user.role !== "SUPERADMIN") return res.status(403).send("Forbidden: SuperAdmin access only");
  res.render("support-inbox", { user: req.user });
});

app.get("/support/chat/:id", authMiddleware, (req, res) => {
  res.render("tenant-chat", { user: req.user, conversationId: req.params.id });
});

app.get("/support/ticket/new", authMiddleware, (req, res) => res.render("create-ticket", { user: req.user }));

app.use("/api/auth", authRoutes);

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected route", user: req.user });
});

app.use("/api/business", businessRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/appointment", require("./modules/appointment/appointment.routes"));
app.use("/api/call", require("./modules/call/call.routes"));
app.use("/api/upload", require("./routes/upload.routes"));
app.use("/api/superadmin", superadminRoutes);
app.use("/api/billing", require("./modules/billing/billing.routes"));
app.use("/api/webhooks", require("./modules/webhooks/webhooks.routes"));
app.use("/api/support", require("./modules/support/support.routes"));
app.use("/api/knowledge", require("./modules/knowledge/knowledge.routes"));

// Public Menu Access
app.use("/", require("./modules/public/public.routes"));

// Public Platform Settings
app.get("/api/platform/settings", (req, res) => {
  const fs = require("fs");
  const configPath = path.join(__dirname, "config/platform.json");
  let config = { projectName: "Nexton Technologies LLC", logoUrl: null };
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (e) {}
  }
  res.json({ success: true, data: config });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

module.exports = app;
