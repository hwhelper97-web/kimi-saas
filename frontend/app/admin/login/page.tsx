"use client";

export default function AdminLoginPage() {
  return (
    <main className="container-pad py-14">
      <h1 className="text-4xl font-semibold">Admin Login</h1>
      <form className="glass-card mt-8 grid max-w-md gap-4 rounded-2xl p-6">
        <input className="rounded-lg border border-brand-border bg-black p-3" type="email" placeholder="admin@shahiposh.com" />
        <input className="rounded-lg border border-brand-border bg-black p-3" type="password" placeholder="Password" />
        <button className="rounded-full bg-brand-accent px-6 py-3 font-semibold text-black">Login</button>
      </form>
    </main>
  );
}
