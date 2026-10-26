import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3001,
    proxy: {
      // Local mock OIDC server (compose.dev.yml). It derives `iss` from the Host header,
      // so present the in-network host the API trusts (http://auth:8080/effekt).
      "/dev-auth": {
        target: "http://localhost:8090",
        changeOrigin: false,
        headers: { Host: "auth:8080" },
        rewrite: (path) => path.replace(/^\/dev-auth/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
