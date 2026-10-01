import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// The gateway mounts these assets at /dashboard, so every emitted URL is
// prefixed there. The build lands inside the Python package so the wheel can
// ship it without a second service.
export default defineConfig({
  base: "/dashboard/",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../jev_gateway/static",
    emptyOutDir: true,
    sourcemap: false,
  },
});
