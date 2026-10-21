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
    preset: process.env.VERCEL ? "vercel" : (process.env.NITRO_PRESET ?? "vercel"),
    output: {
      dir: ".vercel/output",
      serverDir: ".vercel/output/functions/__server.func",
      publicDir: ".vercel/output/static",
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
