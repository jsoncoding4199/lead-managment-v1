import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          50: "#f7f8fa",
          100: "#eef0f4",
          200: "#dce0e8",
          300: "#b8c0cf",
          400: "#8590a6",
          500: "#5d6878",
          600: "#3e4756",
          700: "#2b323e",
          800: "#1c212a",
          900: "#11141a",
        },
        brand: {
          50: "#eef4ff",
          100: "#dae6ff",
          200: "#bcd1ff",
          300: "#8eb1ff",
          400: "#5b87ff",
          500: "#3460ff",
          600: "#1f43e6",
          700: "#1a35b8",
          800: "#1a2f93",
          900: "#1b2c75",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17,20,26,.04), 0 8px 24px -8px rgba(17,20,26,.08)",
        lift: "0 4px 12px -2px rgba(17,20,26,.08), 0 20px 40px -12px rgba(17,20,26,.18)",
      },
      keyframes: {
        in: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        in: "in .18s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
