import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#0F0F0F",
        foreground: "#F8F5EA",
        muted: "#A7A29A",
        border: "rgba(212,175,55,0.22)",
        card: "rgba(18,18,18,0.78)",
        primary: {
          DEFAULT: "#D4AF37",
          foreground: "#0F0F0F"
        },
        accentRed: "#EF1F28",
        accentBlue: "#1c64c8"
      },
      fontFamily: {
        sans: ["Montserrat", "Arial", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"]
      },
      boxShadow: {
        red: "0 18px 46px rgba(212, 175, 55, 0.24)",
        panel: "0 24px 80px rgba(0, 0, 0, 0.58)"
      },
      backgroundImage: {
        "barber-radial":
          "radial-gradient(circle at 18% 8%, rgba(212,175,55,0.14), transparent 28%), radial-gradient(circle at 82% 12%, rgba(239,31,40,0.11), transparent 24%), radial-gradient(circle at 74% 76%, rgba(28,100,200,0.08), transparent 24%), linear-gradient(135deg, #050505 0%, #0F0F0F 44%, #050505 100%)"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
