const PUBLIC_ROUTES = [
  "/api/call/incoming",
  "/api/call/process",
  "/api/call/media-stream",
];

const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      const url = req.originalUrl;

      const isPublic = PUBLIC_ROUTES.some((route) => url.startsWith(route));
      if (isPublic) return next();

      const user = req.user;

      if (!user || !allowedRoles.includes(user.role)) {
        return res.status(403).json({
          error: "Forbidden: insufficient permissions",
        });
      }

      next();
    } catch (error) {
      console.error("Role Middleware Error:", error);
      return res.status(500).json({ error: "Role check failed" });
    }
  };
};

module.exports = { allowRoles };