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
    console.log(`[Auth] Login attempt for: ${normalizedEmail}`);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      console.warn(`[Auth] User not found: ${normalizedEmail}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      console.warn(`[Auth] Password mismatch for: ${normalizedEmail}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Attach first business for convenience in JWT payload (Skip for SuperAdmin to avoid locking them into a tenant)
    let business = null;
    if (user.role !== "SUPERADMIN") {
      business = await prisma.business.findFirst({
        where: { tenantId: user.tenantId },
      });
    }

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
   Generates a secure reset token and saves it to the user.
   In production, this should send an email with the reset link.
=============================== */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      // For security, don't reveal if user exists. Just return success.
      return res.json({ success: true, message: "If an account exists with that email, a reset link has been sent." });
    }

    const crypto = require("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: token,
        resetPasswordExpires: expires
      }
    });

    const resetLink = `${req.protocol}://${req.get('host')}/auth/reset-password?token=${token}`;

    try {
      const emailService = require("../../services/email.service");
      await emailService.sendEmail({
        to: email,
        subject: "Naxton Technologies — Password Reset Request",
        html: `<div style="font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 30px; border-radius: 12px; border: 1px solid #334155;">
          <h2 style="color: #38bdf8; margin-top: 0;">Password Reset Request</h2>
          <p>You requested a password reset for your Naxton Technologies account.</p>
          <p>Click the button below to reset your password. This link will expire in 1 hour:</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${resetLink}" style="background: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">RESET PASSWORD &rarr;</a>
          </div>
          <p style="font-size: 12px; color: #94a3b8;">If you did not request this, you can safely ignore this email.</p>
        </div>`
      });
    } catch (emailErr) {
      console.warn("[AUTH_EMAIL_WARN] Password reset email dispatch failed:", emailErr.message);
    }

    return res.json({ 
      success: true, 
      message: "If an account exists with that email, a reset link has been sent."
    });
  } catch (err) {
    console.error("FORGOT PW ERROR:", err);
    return res.status(500).json({ error: "Request failed" });
  }
};

/* ===============================
   RESET PASSWORD WITH TOKEN
=============================== */
exports.resetPasswordWithToken = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required" });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { gte: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    return res.json({ success: true, message: "Password updated successfully. You can now log in." });
  } catch (err) {
    console.error("RESET WITH TOKEN ERROR:", err);
    return res.status(500).json({ error: "Reset failed" });
  }
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

    const assignedRole = role || "STAFF";

    // 🛡️ Guard: Only SUPERADMIN can assign global privileged roles (SUPERADMIN, DEVELOPER, PRODUCT)
    const { ROLES } = require("../../constants/roles");
    const restrictedGlobalRoles = [ROLES.SUPERADMIN, ROLES.DEVELOPER, ROLES.PRODUCT];
    if (req.user.role !== ROLES.SUPERADMIN && restrictedGlobalRoles.includes(assignedRole.toUpperCase())) {
      return res.status(403).json({ error: "Permission denied: Cannot assign privileged role" });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashed,
        role: assignedRole.toUpperCase(),
        tenantId: req.user.tenantId,
      },
    });

    // Never expose the password hash
    const { password: _pw, ...safeUser } = newUser;

    return res.status(201).json({
      success: true,
      message: "Staff created successfully",
      user: safeUser,
      access: {
        email: safeUser.email,
        role: safeUser.role
      }
    });
  } catch (err) {
    console.error("CREATE STAFF ERROR:", err);
    return res.status(500).json({ error: "Failed to create staff" });
  }
};

/* ===============================
   UPDATE THEME
=============================== */
exports.updateTheme = async (req, res) => {
  try {
    const { theme } = req.body;
    if (!theme) return res.status(400).json({ error: "Theme required" });

    await prisma.user.update({
      where: { id: req.user.id },
      data: { theme },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("UPDATE THEME ERROR:", err);
    return res.status(500).json({ error: "Failed to update theme" });
  }
};

/* ===============================
   UPDATE STAFF
=============================== */
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: "Role is required" });
    }

    // 🛡️ Guard: Only SUPERADMIN can assign global privileged roles
    const { ROLES } = require("../../constants/roles");
    const restrictedGlobalRoles = [ROLES.SUPERADMIN, ROLES.DEVELOPER, ROLES.PRODUCT];
    if (req.user.role !== ROLES.SUPERADMIN && restrictedGlobalRoles.includes(role.toUpperCase())) {
      return res.status(403).json({ error: "Permission denied: Cannot assign privileged role" });
    }

    const user = await prisma.user.findFirst({
      where: { id, tenantId: req.user.tenantId }
    });

    if (!user) return res.status(404).json({ error: "Staff member not found" });

    const updated = await prisma.user.update({
      where: { id },
      data: { role: role.toUpperCase() }
    });

    const { password: _pw, ...safeUpdated } = updated;
    return res.json({ success: true, user: safeUpdated });
  } catch (err) {
    console.error("UPDATE STAFF ERROR:", err);
    return res.status(500).json({ error: "Failed to update staff" });
  }
};

/* ===============================
   DELETE STAFF
=============================== */
exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: { id, tenantId: req.user.tenantId }
    });

    if (!user) return res.status(404).json({ error: "Staff member not found" });
    if (user.id === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });

    await prisma.user.delete({ where: { id } });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE STAFF ERROR:", err);
    return res.status(500).json({ error: "Failed to delete staff" });
  }
};