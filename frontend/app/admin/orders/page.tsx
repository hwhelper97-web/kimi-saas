const orders = [
  { id: "ORD-1024", customer: "Ayesha Khan", total: "$178", status: "Processing" },
  { id: "ORD-1025", customer: "Rohan Malik", total: "$229", status: "Shipped" }
];

export default function AdminOrdersPage() {
  return (
    <main className="container-pad py-14">
      <h1 className="mb-6 text-4xl font-semibold">Manage Orders</h1>
      <div className="overflow-hidden rounded-2xl border border-brand-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-card">
            <tr>
              <th className="p-4">Order ID</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Total</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-brand-border">
                <td className="p-4">{order.id}</td>
                <td className="p-4">{order.customer}</td>
                <td className="p-4">{order.total}</td>
                <td className="p-4 text-brand-accent">{order.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
