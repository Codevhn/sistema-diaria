import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // Motors viven en ../src/ — importados por las views sin copiarlos
      "@motors": resolve(__dirname, "../src"),
    },
  },
  // Cuando buildemos, la app vive en /ui/
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
