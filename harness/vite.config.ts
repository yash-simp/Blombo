import { defineConfig, type Plugin } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"

const here = import.meta.dirname
const game = path.resolve(here, "../game")

/** Redirects the game's imports of platform-owned files to local mirrors and mocks. */
function platform(): Plugin {
  return {
    name: "harness-platform",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null
      if (source === "../tools/ui.css") return path.join(here, "platform/ui.css")
      if (source === "./fonts.css" && importer.startsWith(path.join(game, "src"))) return path.join(here, "platform/empty.css")
      if (source === "./paid.ts" && importer.startsWith(path.join(game, "server"))) return path.join(here, "mock/paid.ts")
      return null
    },
    transform(code, id) {
      if (!id.endsWith("/game/src/styles.css")) return null
      return code
        .replace('@import "./fonts.css";', "")
        .replace('@import "../tools/ui.css";', `@import "${path.join(here, "platform/ui.css")}";`)
    },
  }
}

export default defineConfig({
  root: here,
  plugins: [platform(), vue()],
  resolve: {
    alias: [
      { find: "@/game", replacement: path.join(here, "mock/game.ts") },
      { find: "@/text", replacement: path.join(here, "platform/text.ts") },
      { find: "@/useGameUiScale", replacement: path.join(here, "platform/uiScale.ts") },
      { find: "@blombo/game-runtime", replacement: path.join(here, "mock/runtime.ts") },
      { find: /^@\//, replacement: path.join(game, "src") + "/" },
    ],
    dedupe: ["three", "vue"],
  },
  server: { port: 5199, strictPort: true, hmr: { overlay: false }, fs: { allow: [here, game, path.resolve(here, "../pipeline/out")] } },
  build: { target: "esnext" },
  esbuild: { target: "esnext" },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
})
