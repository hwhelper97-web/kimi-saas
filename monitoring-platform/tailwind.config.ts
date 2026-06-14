import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        border: "var(--border)",
        glass: {
          bg: "rgba(15, 23, 42, 0.45)",
          border: "rgba(255, 255, 255, 0.08)",
        },
        cyber: {
          cyan: "#22d3ee",
          blue: "#2563eb",
          dark: "#020617",
          card: "rgba(3, 7, 18, 0.8)",
        }
      },
      fontFamily: {
        orbitron: ["var(--font-orbitron)", "sans-serif"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
