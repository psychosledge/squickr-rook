import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "virtual:pwa-register/react": path.resolve(__dirname, "./src/__mocks__/pwa-register.ts"),
    },
  },
});
