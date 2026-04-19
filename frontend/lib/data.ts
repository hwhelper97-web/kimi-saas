export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  sizes: string[];
};

export const featuredProducts: Product[] = [
  {
    id: "1",
    name: "Noir Oversized Tee",
    slug: "noir-oversized-tee",
    description: "Heavyweight cotton silhouette with minimal chest mark.",
    price: 89,
    category: "Tops",
    imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
    sizes: ["S", "M", "L", "XL"]
  },
  {
    id: "2",
    name: "Shahi Cargo Pants",
    slug: "shahi-cargo-pants",
    description: "Tailored utility fit with premium matte hardware.",
    price: 149,
    category: "Bottoms",
    imageUrl: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=1200&q=80",
    sizes: ["30", "32", "34", "36"]
  },
  {
    id: "3",
    name: "Monarch Bomber",
    slug: "monarch-bomber",
    description: "Structured bomber with soft satin inner lining.",
    price: 229,
    category: "Outerwear",
    imageUrl: "https://images.unsplash.com/photo-1548883354-94bcfe321cbb?auto=format&fit=crop&w=1200&q=80",
    sizes: ["M", "L", "XL"]
  }
];
