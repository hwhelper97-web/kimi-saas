export function OrderDashboard() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <section className="rounded-xl border p-4">Menu Management</section>
      <section className="rounded-xl border p-4">Live Orders</section>
      <section className="rounded-xl border p-4">Delivery / Pickup</section>
      <section className="rounded-xl border p-4">Revenue Analytics</section>
    </div>
  );
}
