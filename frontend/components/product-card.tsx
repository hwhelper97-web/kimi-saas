"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Product } from "@/lib/data";

export function ProductCard({ product }: { product: Product }) {
  return (
    <motion.article whileHover={{ y: -6 }} className="glass-card overflow-hidden rounded-2xl">
      <Link href={`/products/${product.id}`}>
        <div className="overflow-hidden">
          <img src={product.imageUrl} alt={product.name} className="h-80 w-full object-cover transition duration-300 hover:scale-105" />
        </div>
        <div className="space-y-3 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-brand-accent">{product.category}</p>
          <h3 className="text-lg font-semibold">{product.name}</h3>
          <p className="text-sm text-zinc-400">{product.description}</p>
          <p className="pt-2 text-lg">${product.price}</p>
        </div>
      </Link>
    </motion.article>
  );
}
