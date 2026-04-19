import { notFound } from "next/navigation";
import { featuredProducts } from "@/lib/data";

export default function ProductDetailsPage({ params }: { params: { id: string } }) {
  const product = featuredProducts.find((item) => item.id === params.id);
  if (!product) return notFound();

  return (
    <main className="container-pad grid gap-10 py-14 md:grid-cols-2">
      <img src={product.imageUrl} alt={product.name} className="h-[520px] w-full rounded-2xl object-cover" />
      <section>
        <p className="text-xs uppercase tracking-[0.3em] text-brand-accent">{product.category}</p>
        <h1 className="mt-3 text-4xl font-semibold">{product.name}</h1>
        <p className="mt-6 text-zinc-400">{product.description}</p>
        <p className="mt-6 text-2xl">${product.price}</p>
        <div className="mt-8 flex gap-3">
          {product.sizes.map((size) => (
            <button key={size} className="rounded-full border border-brand-border px-4 py-2 text-sm hover:border-brand-accent">
              {size}
            </button>
          ))}
        </div>
        <button className="mt-8 rounded-full bg-brand-accent px-6 py-3 font-semibold text-black">Add to Cart</button>
      </section>
    </main>
  );
}
