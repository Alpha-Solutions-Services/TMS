import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#38A3FF",
          light: "#5BC8FF",
          dark: "#1A6ED4",
          dim: "rgba(56, 163, 255, 0.10)",
          glow: "rgba(56, 163, 255, 0.25)",
        },
        surface: {
          DEFAULT: "#0B1120",
          2: "#0F1829",
          3: "#141E33",
        },
        chrome: "#8FB4D4",
      },
    },
  },
  plugins: [],
};
export default config;
