import { featuredProducts } from "@/lib/data";

export default function AdminProductsPage() {
  return (
    <main className="container-pad py-14">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-semibold">Manage Products</h1>
        <button className="rounded-full bg-brand-accent px-5 py-2 font-semibold text-black">Add Product</button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-brand-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-card">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Category</th>
              <th className="p-4">Price</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {featuredProducts.map((product) => (
              <tr key={product.id} className="border-t border-brand-border">
                <td className="p-4">{product.name}</td>
                <td className="p-4 text-zinc-400">{product.category}</td>
                <td className="p-4">${product.price}</td>
                <td className="space-x-3 p-4">
                  <button>Edit</button>
                  <button className="text-red-400">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
