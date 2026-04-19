import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          background: "#090909",
          card: "#121212",
          border: "#262626",
          accent: "#E8C27A",
          text: "#F5F5F5"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        luxury: "0 12px 30px rgba(232, 194, 122, 0.15)"
      }
    }
  },
  plugins: []
};

export default config;
