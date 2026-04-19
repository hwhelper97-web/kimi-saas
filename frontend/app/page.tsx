import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/product-card";
import { featuredProducts } from "@/lib/data";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <section className="container-pad py-10">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-3xl font-semibold">Featured Pieces</h2>
          <p className="text-sm text-zinc-400">Curated premium drops</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </main>
  );
}
