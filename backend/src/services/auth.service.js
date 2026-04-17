const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { jwtSecret } = require("../config/env");
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
  const user = await prisma.user.findUnique({ where: { email }, include: { business: true } });
  if (!user) throw new HttpError(401, "Invalid credentials");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid credentials");

  return buildAuthResponse(user, user.business);
}

function buildAuthResponse(user, business) {
  const token = jwt.sign(
    {
      userId: user.id,
      businessId: business.id,
      role: user.role,
      businessType: business.businessType,
    },
    jwtSecret,
    { expiresIn: "7d" }
  );

  return {
    accessToken: token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      businessId: business.id,
      businessType: business.businessType,
    },
  };
}

module.exports = { register, login };
