import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vinext from "vinext";
// @ts-expect-error -- plain-JS dev tooling, outside the app's tsconfig include list
import { captureViewPlugin } from "./scripts/capture-view-plugin.mjs";

export default defineConfig({
  plugins: [
    // Dev-only, and registered first so it answers /api/capture-view before the worker
    // catch-all does. The app itself runs in workerd, which cannot write to the filesystem.
    captureViewPlugin(),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
