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
        background: "#030303",
        foreground: "#f7f7f7",
        muted: "#a8a8a8",
        border: "rgba(255,255,255,0.16)",
        card: "rgba(13,13,13,0.82)",
        primary: {
          DEFAULT: "#ef1f28",
          foreground: "#ffffff"
        },
        accentBlue: "#1c64c8"
      },
      fontFamily: {
        sans: ["Montserrat", "Arial", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"]
      },
      boxShadow: {
        red: "0 18px 46px rgba(239, 31, 40, 0.24)",
        panel: "0 24px 80px rgba(0, 0, 0, 0.55)"
      },
      backgroundImage: {
        "barber-radial":
          "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.08), transparent 28%), radial-gradient(circle at 80% 12%, rgba(239,31,40,0.13), transparent 24%), linear-gradient(135deg, #050505 0%, #111 44%, #050505 100%)"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
