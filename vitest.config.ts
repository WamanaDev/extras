import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest 4 removeu `environmentMatchGlobs`: o ambiente por glob agora é
// feito com `projects` (cada projeto herda a config raiz via `extends`).
const jsdomGlobs = [
  "src/components/**/*.test.tsx",
  "src/app/**/*.test.tsx",
  "src/hooks/**/*.test.ts",
  "src/hooks/**/*.test.tsx",
];

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ["./vitest.setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: jsdomGlobs,
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: jsdomGlobs,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
