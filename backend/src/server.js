require("dotenv").config();
const fs = require("fs");
const path = require("path");
const app = require("./app");
const prisma = require("./config/prisma");

const PORT = process.env.PORT || 5000;
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

async function main() {
  await prisma.$connect();
  app.listen(PORT, () => console.log(`ShahiPosh backend running on http://localhost:${PORT}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
