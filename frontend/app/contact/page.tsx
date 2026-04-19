export default function ContactPage() {
  return (
    <main className="container-pad py-14">
      <h1 className="text-4xl font-semibold">Contact</h1>
      <form className="glass-card mt-8 grid max-w-2xl gap-4 rounded-2xl p-6">
        <input className="rounded-lg border border-brand-border bg-black p-3" placeholder="Your Name" />
        <input className="rounded-lg border border-brand-border bg-black p-3" placeholder="Email" type="email" />
        <textarea className="rounded-lg border border-brand-border bg-black p-3" rows={5} placeholder="Message" />
        <button className="rounded-full bg-brand-accent px-6 py-3 font-semibold text-black">Send Message</button>
      </form>
    </main>
  );
}
