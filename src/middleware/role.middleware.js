const { ROLES } = require("../constants/roles");

/**
 * Middleware to restrict access to specific roles.
 * Must be used after authMiddleware.
 */
const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // SuperAdmin bypass
      if (req.user.role === ROLES.SUPERADMIN) return next();

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ 
          error: "Permission denied", 
          required: allowedRoles,
          current: req.user.role
        });
      }

      next();
    } catch (error) {
      console.error("Role Middleware Error:", error);
      return res.status(500).json({ error: "Role check failed" });
    }
  };
};

/**
 * Helper to check if user is part of support staff
 */
const isSupportStaff = (req, res, next) => {
  const supportRoles = [ROLES.OWNER, ROLES.ADMIN, ROLES.AGENT, ROLES.SUPERADMIN, ROLES.DEVELOPER, ROLES.MANAGER, ROLES.PRODUCT];
  if (!supportRoles.includes(req.user.role)) {
    return res.status(403).json({ error: "Access restricted to support personnel" });
  }
  next();
};

module.exports = { 
  allowRoles,
  isSupportStaff
};