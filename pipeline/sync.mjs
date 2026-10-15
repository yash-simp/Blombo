// Bundle changed game files from ../game into out/sync.json for the workspace (see sync/unpack.mjs).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
const root = path.resolve(import.meta.dirname, "../game")
const stateFile = path.resolve(import.meta.dirname, "out/sync-state.json")
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {}
const files = {}
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = path.relative(root, full).split(path.sep).join("/")
    if (statSync(full).isDirectory()) walk(full)
    else {
      const text = readFileSync(full, "utf8")
      const hash = createHash("sha256").update(text).digest("hex")
      if (process.argv.includes("--all") || state[rel] !== hash) files[rel] = text
      state[rel] = hash
    }
  }
}
walk(root)
const out = path.resolve(import.meta.dirname, "out/sync.json")
const body = JSON.stringify({ files })
writeFileSync(out, body)
writeFileSync(stateFile, JSON.stringify(state))
const sha = createHash("sha256").update(body).digest("hex")
console.log(Object.keys(files).join("\n") || "(nothing changed)")
console.log(`bytes=${Buffer.byteLength(body)} sha256=${sha}`)
