export default function CartCheckoutPage() {
  return (
    <main className="container-pad py-14">
      <h1 className="text-4xl font-semibold">Cart & Checkout</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="glass-card rounded-2xl p-6 lg:col-span-2">
          <p className="text-zinc-300">Your selected pieces will appear here.</p>
        </section>
        <aside className="glass-card rounded-2xl p-6">
          <h2 className="text-xl font-semibold">Order Summary</h2>
          <p className="mt-4 text-zinc-400">Subtotal: $0.00</p>
          <button className="mt-6 w-full rounded-full bg-brand-accent py-3 font-semibold text-black">Proceed to Checkout</button>
        </aside>
      </div>
    </main>
  );
}
