import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Identidade Extrinha — coral (ação/destaque) + petróleo (base/texto de marca).
        brand: {
          50: "#FFF3EE",
          100: "#FFE3D8",
          200: "#FFC4AE",
          300: "#FFA07D",
          400: "#FF8A66",
          500: "#FF6B4D",
          600: "#E8532F",
          700: "#C43F20",
          800: "#9C331B",
          900: "#7A2A18",
        },
        petrol: {
          50: "#E7F1F0",
          100: "#C9DEDC",
          400: "#146560",
          600: "#0B4F4A",
          700: "#093F3B",
          800: "#083935",
          900: "#06302C",
        },
      },
    },
  },
  plugins: [],
};

export default config;
