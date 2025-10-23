import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-soft": "var(--bg-soft)",
        card: "var(--card)",
        border: "var(--border)",
        primary: {
          DEFAULT: "var(--primary)",
          600: "var(--primary-600)",
        },
        accent: "var(--accent)",
        text: "var(--text)",
        muted: "var(--muted)",
        dashed: "var(--dashed)",
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        glass: "0 25px 45px -25px rgba(15, 23, 42, 0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
