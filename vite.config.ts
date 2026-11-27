import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": root } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { rollupOptions: { input: { studio: "index.html", lab: "lab.html" } } },
  server: { host: "127.0.0.1", port: 4186 },
});
