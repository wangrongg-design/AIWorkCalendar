import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        black: "#1A1A1A",
        "gray-7": "#2E2E2E",
        "gray-6": "#424242",
        "gray-5": "#737373",
        "gray-4": "#A3A3A3",
        "gray-3": "#CCCCCC",
        "gray-2": "#E6E6E6",
        "gray-1": "#F6F6F6",
        white: "#FFFFFF",
        ink: "#1A1A1A",
        text: "#424242",
        muted: "#737373",
        placeholder: "#A3A3A3",
        line: "#E6E6E6",
        surface: "#F6F6F6",
        page: "#F6F6F6",
        "surface-container": "#F6F6F6",
        "surface-container-low": "#FFFFFF",
        "surface-high": "#FFFFFF",
        panel: "#FFFFFF",
        primary: "#0B57D0",
        "primary-hover": "#1A73E8",
        "primary-pressed": "#0847A6",
        "primary-container": "#D3E3FD",
        "primary-bg": "#EEF5FF",
        "on-primary-container": "#0B57D0",
        secondary: "#0F766E",
        "secondary-hover": "#14A39A",
        "secondary-container": "#CCFBF1",
        "secondary-bg": "#ECFDF9",
        warning: "#D97706",
        "warning-bg": "#FFFBEB",
        success: "#16A34A",
        "success-bg": "#F0FDF4",
        danger: "#EE3B2B",
        "danger-pressed": "#C92A20",
        "danger-bg": "#FEF2F2",
        accent: "#0B57D0"
      }
    }
  },
  plugins: []
};

export default config;
