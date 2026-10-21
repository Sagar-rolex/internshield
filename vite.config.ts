import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Detect Vercel environment automatically to build for Vercel Serverless Functions (.vercel/output).
export default defineConfig({
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
