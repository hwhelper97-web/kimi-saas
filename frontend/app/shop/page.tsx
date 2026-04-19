import { ProductCard } from "@/components/product-card";
import { featuredProducts } from "@/lib/data";

export default function ShopPage() {
  return (
    <main className="container-pad py-14">
      <h1 className="mb-3 text-4xl font-semibold">Shop</h1>
      <p className="mb-8 text-zinc-400">Minimal silhouettes. Maximum presence.</p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {featuredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  );
}
