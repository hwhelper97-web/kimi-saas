import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "ShahiPosh | Premium Clothing",
  description: "ShahiPosh premium fashion e-commerce experience.",
  openGraph: {
    title: "ShahiPosh",
    description: "Luxury fashion inspired by global streetwear houses."
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
