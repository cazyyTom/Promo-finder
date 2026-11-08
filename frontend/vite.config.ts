import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: ["terminal.local"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
  },
});
