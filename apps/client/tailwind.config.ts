import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1016",
        surface: "#151826",
        accent: {
          DEFAULT: "#6c5ce7",
          soft: "#4a47a3",
        },
      },
    },
  },
  plugins: [],
};

export default config;
