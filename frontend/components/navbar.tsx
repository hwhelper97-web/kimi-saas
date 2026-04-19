import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/cart", label: "Cart" }
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-border bg-black/70 backdrop-blur">
      <nav className="container-pad flex h-16 items-center justify-between">
        <Link href="/" className="text-xl font-semibold tracking-[0.2em] text-brand-accent">
          SHAHIPOSH
        </Link>
        <ul className="flex items-center gap-6 text-sm text-zinc-300">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="transition hover:text-brand-accent">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
