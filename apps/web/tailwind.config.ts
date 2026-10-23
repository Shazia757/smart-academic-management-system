import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        // Dedicated Academic Theme Pastel Tokens
        soft: {
          teal: "#DCECEF",
          blue: "#C4DDE1",
          darkTeal: "#0F4C5C",
          midTeal: "#176477",
          borderTeal: "#2A6674",
          purple: "#E8EEF5",
          amber: "#FEF3C7",
          rose: "#FEE2E2",
          slate: "#F4F8FA",
        },
      },
      borderRadius: {
        xl: "var(--radius)",
        lg: "calc(var(--radius) - 2px)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.06)",
        card: "0 1px 3px 0 rgba(36, 54, 75, 0.04), 0 1px 2px -1px rgba(36, 54, 75, 0.03)",
        "card-hover": "0 8px 20px -4px rgba(36, 54, 75, 0.08), 0 4px 6px -2px rgba(36, 54, 75, 0.03)",
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
      },
      fontFamily: {
        sans: [
          "'Google Sans'",
          "'Google Sans Text'",
          "'Product Sans'",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
