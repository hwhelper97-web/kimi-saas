const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  console.log("🚀 Starting Appointment Schema Migration...");

  // 1. Migrate AppointmentService durations
  const services = await prisma.appointmentService.findMany();
  console.log(`Found ${services.length} services to migrate.`);

  for (const service of services) {
    await prisma.appointmentService.update({
      where: { id: service.id },
      data: {
        durationMinutes: service.duration,
        isActive: service.isAvailable
      }
    });
  }

  // 2. Migrate existing appointments to have durationMinutes
  const appointments = await prisma.appointment.findMany();
  console.log(`Found ${appointments.length} appointments to migrate.`);

  for (const appt of appointments) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: {
        durationMinutes: 30 // Default or try to find service
      }
    });
  }

  console.log("✅ Migration completed successfully.");
}

migrate()
  .catch(e => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
