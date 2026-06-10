const PUBLIC_ROUTES = [
  "/api/call/incoming",
  "/api/call/process",
  "/api/call/media-stream",
];

const tenantMiddleware = (req, res, next) => {
  try {
    const url = req.originalUrl;

    const isPublic = PUBLIC_ROUTES.some((route) => url.startsWith(route));
    if (isPublic) return next();

    if (!req.user || (!req.user.tenantId && req.user.role !== "SUPERADMIN")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 🛡️ Guard: Only set tenantId if not already established by authMiddleware/proxy
    req.tenantId = req.tenantId || req.user.tenantId || null;
    next();
  } catch (error) {
    console.error("Tenant Middleware Error:", error);
    return res.status(500).json({ error: "Tenant check failed" });
  }
};

module.exports = { tenantMiddleware };