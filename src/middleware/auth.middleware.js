const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// Exact-match public paths (checked against req.originalUrl)
const PUBLIC_EXACT = ["/", "/login"];

// Prefix-match public paths (any sub-path is public)
const PUBLIC_PREFIXES = [
  "/api/call/incoming",
  "/api/call/process",
  "/api/call/media-stream",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  // static assets needed by the admin UI
  "/js/",
  "/css/",
  "/images/",
  "/fonts/",
];

module.exports = async (req, res, next) => {
  try {
    const originalUrl = req.originalUrl.split("?")[0]; // strip query string

    // Exact matches (top‑level pages only)
    if (PUBLIC_EXACT.includes(originalUrl)) return next();

    // Prefix matches (Twilio webhooks + auth routes + admin UI + static assets)
    const isPrefixPublic = PUBLIC_PREFIXES.some((route) =>
      originalUrl.startsWith(route)
    );
    if (isPrefixPublic) return next();

    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Token expired or invalid" });
    }

    if (!decoded.id) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, tenantId: true, role: true, email: true, theme: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    // Fetch branding (Prioritize active business, fallback to tenant)
    let brandingName = null;
    let brandingLogo = null;

    // Allow businessId override from query (useful for SuperAdmin proxying)
    const effectiveBusinessId = (user.role === 'SUPERADMIN' && req.query.businessId) 
      ? req.query.businessId 
      : (decoded.businessId || null);

    if (effectiveBusinessId) {
      const business = await prisma.business.findUnique({
        where: { id: effectiveBusinessId },
        select: { name: true, logoUrl: true, tenantId: true }
      });
      if (business) {
        brandingName = business.name;
        brandingLogo = business.logoUrl;
        
        // If SuperAdmin is proxying, update req.tenantId to match the business's tenant
        if (user.role === 'SUPERADMIN') {
          req.tenantId = business.tenantId;
        }
      }
    }

    if (!brandingName || !brandingLogo) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true, logoUrl: true }
      });
      if (tenant) {
        brandingName = brandingName || tenant.name.replace(/ Tenant$/i, "");
        brandingLogo = brandingLogo || tenant.logoUrl;
      }
    }

    req.user = user;
    req.tenantId = req.tenantId || user.tenantId; // Use overridden tenantId if set above
    req.businessId = effectiveBusinessId;

    res.locals.platformLogo = brandingLogo || res.locals.platformLogo;
    res.locals.businessName = brandingName || res.locals.businessName;

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(500).json({ error: "Authentication error" });
  }
};
