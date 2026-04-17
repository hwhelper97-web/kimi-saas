const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { getJwtSecret } = require("../config/env");
const { HttpError } = require("../lib/httpError");

async function register(input) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new HttpError(409, "Email already registered");

  const business = await prisma.business.create({
    data: {
      name: input.businessName,
      slug: input.businessName.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now(),
      phone: input.businessPhone,
      businessType: input.businessType,
    },
  });

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: "OWNER",
      businessId: business.id,
    },
  });

  return buildAuthResponse(user, business);
}

async function login({ email, password }) {
  try {
    if (!email || !password) {
      throw new HttpError(400, "Email and password are required");
    }

    console.log(`[auth.service] Login attempt for email: ${email}`);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { business: true },
    });

    if (!user || !user.passwordHash) {
      console.warn(`[auth.service] Login failed: user not found or missing passwordHash for ${email}`);
      throw new HttpError(401, "Invalid credentials");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      console.warn(`[auth.service] Login failed: invalid password for ${email}`);
      throw new HttpError(401, "Invalid credentials");
    }

    return buildAuthResponse(user, user.business);
  } catch (error) {
    if (error instanceof HttpError) throw error;

    console.error("[auth.service] Unexpected login error", {
      email,
      message: error?.message,
      stack: error?.stack,
    });
    throw new HttpError(500, "Unable to process login");
  }
}

function buildAuthResponse(user, business) {
  const safeBusiness = business || null;
  const businessId = safeBusiness?.id || user.businessId || null;
  const businessType = safeBusiness?.businessType || null;

  if (!businessId) {
    console.warn(`[auth.service] User ${user.id} has no business relation`);
  }

  const token = jwt.sign(
    {
      userId: user.id,
      businessId,
      role: user.role,
      businessType,
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );

  return {
    accessToken: token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      businessId,
      businessType,
    },
  };
}

module.exports = { register, login };
