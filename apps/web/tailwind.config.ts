import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f1f1f",
        muted: "#5f6368",
        line: "#dadce0",
        surface: "#f8fafd",
        "surface-container": "#eef3f8",
        "surface-high": "#ffffff",
        primary: "#0b57d0",
        "primary-container": "#d3e3fd",
        "on-primary-container": "#041e49",
        secondary: "#0f766e",
        "secondary-container": "#ccfbf1",
        warning: "#b06000",
        danger: "#b3261e",
        accent: "#0b57d0"
      }
    }
  },
  plugins: []
};

export default config;
