import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        sidebar: "var(--sidebar)",
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        border: "var(--border)"
      },
      borderRadius: {
        xl: "14px"
      },
      boxShadow: {
        surface: "0 10px 30px rgba(20, 20, 26, 0.04)"
      }
    }
  },
  plugins: []
};

export default config;
