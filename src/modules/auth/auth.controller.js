const authService = require("./auth.service");
const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

/* ===============================
   REGISTER
   Delegates to the transaction-safe service (creates tenant + user + default business atomically)
=============================== */
exports.register = async (req, res) => {
  try {
    const { tenantName, email, password } = req.body;

    if (!tenantName || !email || !password) {
      return res.status(400).json({
        error: "tenantName, email and password are required",
      });
    }

    const result = await authService.registerTenantAdmin({ tenantName, email, password });

    return res.status(201).json({
      success: true,
      message: "Account registered successfully",
      user: result.user,
    });
  } catch (error) {
    // Duplicate email comes back as a thrown Error from the service
    if (error.message === "Email already exists") {
      return res.status(409).json({ error: "Email already in use" });
    }
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ error: "Registration failed" });
  }
};

/* ===============================
   LOGIN
   Returns short-lived access token + longer-lived refresh token
=============================== */
exports.login = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: "No data sent to server" });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Attach first business for convenience in JWT payload
    const business = await prisma.business.findFirst({
      where: { tenantId: user.tenantId },
    });

    const accessToken = jwt.sign(
      {
        id: user.id,
        tenantId: user.tenantId,
        role: user.role,
        businessId: business?.id || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    // Remove password from user object before sending
    const { password: _, ...safeUser } = user;

    // Set cookie for EJS/browser navigation
    res.cookie("token", accessToken, {
      httpOnly: false, // Set to false if you need to access it from client JS, true for better security
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    return res.json({ 
      success: true, 
      token: accessToken, 
      refreshToken, 
      user: safeUser 
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ success: false, error: "Login failed" });
  }
};

/* ===============================
   REFRESH TOKEN
=============================== */
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token required" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const newAccessToken = jwt.sign(
      {
        id: user.id,
        tenantId: user.tenantId,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    return res.json({ accessToken: newAccessToken });
  } catch {
    return res.status(403).json({ error: "Invalid or expired refresh token" });
  }
};

/* ===============================
   RESET PASSWORD (Logged-in user)
=============================== */
exports.resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: "New password required" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed },
    });

    return res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("RESET ERROR:", err);
    return res.status(500).json({ error: "Reset failed" });
  }
};

/* ===============================
   FORGOT PASSWORD
   ⚠️  MVP stub — production should send a time-limited email token.
   Currently disabled to prevent unauthenticated password overwrite.
=============================== */
exports.forgotPassword = async (req, res) => {
  return res.status(501).json({
    error:
      "Forgot password via direct API is disabled for security. Use the reset-password endpoint while logged in, or implement an email-token flow.",
  });
};

/* ===============================
   GET STAFF (OWNER only)
=============================== */
exports.getStaff = async (req, res) => {
  try {
    const staff = await prisma.user.findMany({
      where: { tenantId: req.user.tenantId },
      select: { id: true, email: true, role: true },
    });

    return res.json({ success: true, data: staff });
  } catch (error) {
    console.error("GET STAFF ERROR:", error);
    return res.status(500).json({ error: "Failed to fetch staff" });
  }
};

/* ===============================
   CREATE STAFF (OWNER only)
=============================== */
exports.createStaff = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashed,
        role: role || "STAFF",
        tenantId: req.user.tenantId,
      },
    });

    // Never expose the password hash
    const { password: _pw, ...safeUser } = newUser;

    return res.status(201).json({
      success: true,
      message: "Staff created successfully",
      user: safeUser,
    });
  } catch (err) {
    console.error("CREATE STAFF ERROR:", err);
    return res.status(500).json({ error: "Failed to create staff" });
  }
};