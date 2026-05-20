/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50:  "#f0faf4",
          100: "#d8f3e3",
          200: "#b4e5c9",
          300: "#7ecfa8",
          400: "#45b37f",
          500: "#239660",
          600: "#167a4d",
          700: "#12623e",
          800: "#114e33",
          900: "#0e3f29",
          950: "#07241700",
        },
        dark: {
          900: "#0a0f0d",
          800: "#111810",
          700: "#182015",
          600: "#1e2a1a",
          500: "#243220",
        }
      },
      fontFamily: {
        sans: ["'DM Sans'", "sans-serif"],
        display: ["'Syne'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      animation: {
        "fade-up":    "fadeUp 0.5s ease forwards",
        "fade-in":    "fadeIn 0.4s ease forwards",
        "slide-in":   "slideIn 0.4s ease forwards",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "count-up":   "countUp 0.6s ease forwards",
      },
      keyframes: {
        fadeUp:   { "0%": { opacity: 0, transform: "translateY(16px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        fadeIn:   { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        slideIn:  { "0%": { opacity: 0, transform: "translateX(-12px)" }, "100%": { opacity: 1, transform: "translateX(0)" } },
        countUp:  { "0%": { opacity: 0, transform: "translateY(8px)" },  "100%": { opacity: 1, transform: "translateY(0)" } },
      },
      backdropBlur: { xs: "2px" },
      boxShadow: {
        card:   "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        glow:   "0 0 24px rgba(35,150,96,0.25)",
        "glow-sm": "0 0 12px rgba(35,150,96,0.15)",
      },
    },
  },
  plugins: [],
}
