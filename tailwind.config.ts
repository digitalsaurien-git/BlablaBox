import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17211b",
        moss: "#44624a",
        clay: "#b4634a",
        paper: "#f7f2ea",
        mist: "#e5ece5",
      },
    },
  },
  plugins: [],
};

export default config;
