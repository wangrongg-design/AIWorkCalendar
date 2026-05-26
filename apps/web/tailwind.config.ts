import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        text: "#374151",
        muted: "#6B7280",
        placeholder: "#9CA3AF",
        line: "#E5E7EB",
        surface: "#F8FAFC",
        page: "#F8FAFC",
        "surface-container": "#F3F6FA",
        "surface-high": "#ffffff",
        panel: "#ffffff",
        primary: "#0B57D0",
        "primary-hover": "#1A73E8",
        "primary-container": "#D3E3FD",
        "on-primary-container": "#0B57D0",
        secondary: "#0F766E",
        "secondary-hover": "#14A39A",
        "secondary-container": "#CCFBF1",
        warning: "#D97706",
        danger: "#DC2626",
        accent: "#0B57D0"
      }
    }
  },
  plugins: []
};

export default config;
