const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");

/* =========================================
   🏢 REGISTER TENANT + OWNER (SAAS CORE)
========================================= */
exports.registerTenantAdmin = async (data) => {
  const { tenantName, email, password } = data;

  // 🔒 Validation
  if (!tenantName || !email || !password) {
    throw new Error("tenantName, email and password are required");
  }

  // 🔍 Check existing user
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error("Email already exists");
  }

  // 🔐 Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // 🔥 Transaction for safe creation
  const result = await prisma.$transaction(async (tx) => {

    // 1️⃣ Create Tenant
    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
      },
    });

    // 2️⃣ Create OWNER user
    const user = await tx.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "OWNER", // ✅ IMPORTANT (RBAC FIX)
        tenantId: tenant.id,
      },
    });

    // 3️⃣ Create default business
    await tx.business.create({
      data: {
        name: tenantName,
        phoneNumber: "",
        tenantId: tenant.id,
      },
    });

    // 🔒 Remove password from response
    delete user.password;

    return { tenant, user };
  });

  return result;
};