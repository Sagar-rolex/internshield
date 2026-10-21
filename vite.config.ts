import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    preview: {
      allowedHosts: ["internshieldai-frontend.onrender.com"],
    },
    server: {
      allowedHosts: true,
    },
  },
  nitro: {
    preset: "vercel",
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
