const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

async function login(req, res) {
  const { email, password } = req.body;
  const admin = await prisma.adminUser.findUnique({ where: { email } });

  if (!admin) return res.status(401).json({ message: "Invalid credentials" });
  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign({ sub: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: "12h" });
  return res.json({ token });
}

module.exports = { login };
