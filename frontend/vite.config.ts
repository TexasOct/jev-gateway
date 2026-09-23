import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The gateway mounts these assets at /dashboard, so every emitted URL is
// prefixed there. The build lands inside the Python package so the wheel can
// ship it without a second service.
export default defineConfig({
  base: "/dashboard/",
  plugins: [react()],
  build: {
    outDir: "../jev_gateway/static",
    emptyOutDir: true,
    sourcemap: false,
  },
});
