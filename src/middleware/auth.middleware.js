const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// Exact-match public paths (checked against req.originalUrl)
const PUBLIC_EXACT = ["/", "/login", "/admin"];

// Prefix-match public paths (any sub-path is public)
const PUBLIC_PREFIXES = [
  "/api/call/incoming",
  "/api/call/process",
  "/api/call/media-stream",
  "/api/auth",
];

module.exports = async (req, res, next) => {
  try {
    const originalUrl = req.originalUrl.split("?")[0]; // strip query string

    // Exact matches (top-level pages only)
    if (PUBLIC_EXACT.includes(originalUrl)) return next();

    // Prefix matches (Twilio webhooks + auth routes)
    const isPrefixPublic = PUBLIC_PREFIXES.some((route) =>
      originalUrl.startsWith(route)
    );
    if (isPrefixPublic) return next();

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Authorization header missing" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Invalid token format" });
    }

    const token = authHeader.split(" ")[1];
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
      select: { id: true, tenantId: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    req.user = user;
    req.tenantId = user.tenantId;
    req.businessId = decoded.businessId || null;

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(500).json({ error: "Authentication error" });
  }
};