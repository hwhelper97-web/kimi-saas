"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function Hero() {
  return (
    <section className="container-pad grid min-h-[70vh] items-center gap-10 py-12 md:grid-cols-2">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <p className="mb-4 text-sm uppercase tracking-[0.4em] text-brand-accent">New Collection 2026</p>
        <h1 className="text-4xl font-semibold leading-tight md:text-6xl">Command attention with quiet luxury.</h1>
        <p className="mt-6 max-w-xl text-zinc-400">
          ShahiPosh blends minimal tailoring with street precision. Made for premium everyday wear.
        </p>
        <div className="mt-8 flex gap-4">
          <Link href="/shop" className="rounded-full bg-brand-accent px-6 py-3 text-sm font-semibold text-black">
            Shop Now
          </Link>
          <Link href="/about" className="rounded-full border border-brand-border px-6 py-3 text-sm hover:border-brand-accent">
            Our Story
          </Link>
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9 }}
        className="glass-card overflow-hidden rounded-3xl"
      >
        <img
          src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80"
          alt="ShahiPosh hero"
          className="h-[460px] w-full object-cover"
        />
      </motion.div>
    </section>
  );
}
