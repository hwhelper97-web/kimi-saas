const express = require("express");
const cors = require("cors");
const path = require("path");

const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const authRoutes = require("./modules/auth/auth.routes");
const superadminRoutes = require("./modules/superadmin/superadmin.routes");
const businessRoutes = require("./modules/business/business.routes");
const menuRoutes = require("./modules/menu/menu.routes");
const orderRoutes = require("./modules/order/order.routes");

const authMiddleware = require("./middleware/auth.middleware");

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "../public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Global Platform Middleware
app.use((req, res, next) => {
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "config/platform.json");
  let config = { projectName: "Kimi SaaS", logoUrl: null };
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {}
  }
  res.locals.platformLogo = config.logoUrl;
  res.locals.projectName = config.projectName;
  next();
});

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Kimi SaaS API Running",
  });
});

app.get("/admin", (req, res) => {
  res.render("admin-dashboard-apex");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.use("/api/auth", authRoutes);

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    message: "Protected route",
    user: req.user,
  });
});

app.use("/api/business", businessRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/appointment", require("./modules/appointment/appointment.routes"));
app.use("/api/call", require("./modules/call/call.routes"));
app.use("/api/upload", require("./routes/upload.routes"));
app.use("/api/superadmin", superadminRoutes);

// Public Platform Settings
app.get("/api/platform/settings", (req, res) => {
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "config/platform.json");
  let config = { projectName: "Kimi SaaS", logoUrl: null };
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {}
  }
  res.json({ success: true, data: config });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

module.exports = app;
