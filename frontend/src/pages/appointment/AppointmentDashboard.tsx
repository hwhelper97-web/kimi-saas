export function AppointmentDashboard() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <section className="rounded-xl border p-4">Calendar View (Bookings timeline)</section>
      <section className="rounded-xl border p-4">Availability & Time Slots</section>
      <section className="rounded-xl border p-4">Clients</section>
      <section className="rounded-xl border p-4">Voice booking analytics</section>
    </div>
  );
}
