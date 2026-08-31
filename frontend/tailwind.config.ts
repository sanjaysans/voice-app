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
        "surface-subtle": "var(--surface-subtle)",
        "surface-raised": "var(--surface-raised)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-ink": "var(--accent-ink)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        muted: "var(--muted)",
        subtle: "var(--text-subtle)",
        focus: "var(--focus)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)"
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
