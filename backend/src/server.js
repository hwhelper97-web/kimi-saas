const app = require("./app");
const prisma = require("./config/prisma");
const { port } = require("./config/env");

async function main() {
  await prisma.$connect();
  app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
