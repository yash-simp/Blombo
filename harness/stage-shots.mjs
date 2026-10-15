// The tournament stage show: scoreboard, stage lights and fireworks near the stage in Lantern Lake,
// in phone portrait and landscape. Usage: node stage-shots.mjs [scene ...] [--only=portrait,landscape]
// Shots land in ./shots/<shape>/stage-<scene>.png; errors go to shots/stage-report.json.
import { chromium } from "playwright-core"
import { mkdirSync, writeFileSync } from "node:fs"

const BASE = "http://localhost:5199/"
const SHAPES = {
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
}
const args = process.argv.slice(2)
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean)
const phase = (args.find((a) => a.startsWith("--phase=")) ?? "--phase=day").slice(8)
const scenes = args.filter((a) => !a.startsWith("--"))
const at = (args.find((a) => a.startsWith("--at=")) ?? "--at=-12,37,1.62").slice(5).split(",").map(Number)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const teleport = (page, x, z, yaw) =>
  page.evaluate(([x, z, yaw]) => {
    const h = window.__harness
    h.player.x = x
    h.player.z = z
    h.player.yaw = yaw
    h.game.player.position.set(x, 1, z)
  }, [x, z, yaw])

/** A fake live board (species indexes from Lantern Lake). */
const fakeBoard = (live, crown) => (page) =>
  page.evaluate(
    ([live, crown]) => {
      const s = window.__harness.store
      const now = Date.now()
      s.tourney = {
        round: (s.tourney?.round ?? 1) + (live ? 1 : 0),
        live,
        startsAt: live ? now - 60_000 : now + 9 * 60_000 + 30_000,
        endsAt: live ? now + 3 * 60_000 + 12_000 : now + 14 * 60_000,
        board: [
          { n: "Pip the Bold", u: "u-pip", s: 142, sp: 4, g: 2840 },
          { n: s.me?.name ?? "You", u: s.userId, s: 131, sp: 2, g: 1630 },
          { n: "Marigold", u: "u-mari", s: 118, sp: 0, g: 410 },
          { n: "Otto", u: "u-otto", s: 97, sp: 1, g: 300 },
        ],
        crown,
      }
    },
    [live, crown],
  )

const SCENES = {
  /** Before any change: what the stage looks like (baseline). */
  async base(page, shot) {
    await shot("base")
  },
  /** Live tournament with a board, then it ends: fireworks. */
  async live(page, shot) {
    await fakeBoard(false, "")(page)
    await sleep(1200)
    await fakeBoard(true, "")(page)
    await sleep(900)
    await shot("live-start")
    await sleep(3500)
    await shot("live")
    await fakeBoard(false, "u-pip")(page)
    await sleep(1600)
    await shot("end-fireworks")
    await sleep(2200)
    await shot("end-fireworks-2")
  },
  /** Idle: the champion with the crown and the next start. */
  async idle(page, shot) {
    await fakeBoard(false, "u-pip")(page)
    await sleep(1500)
    await shot("idle")
  },
  /** Live but nobody has caught anything yet. */
  async empty(page, shot) {
    await page.evaluate(() => {
      const s = window.__harness.store
      const now = Date.now()
      s.tourney = { round: 99, live: true, startsAt: now - 5000, endsAt: now + 295_000, board: [], crown: "" }
    })
    await sleep(1500)
    await shot("empty")
  },
  /** No champion yet and nobody on the board. */
  async fresh(page, shot) {
    await page.evaluate(() => {
      const s = window.__harness.store
      s.tourney = { round: 5, live: false, startsAt: Date.now() + 61_000, endsAt: Date.now() + 361_000, board: [], crown: "" }
    })
    await sleep(1500)
    await shot("fresh")
  },
  /** A free camera on the plaza looking up at the whole show (debug view of the fireworks). */
  async wide(page, shot) {
    await page.evaluate(() => {
      const g = window.__harness.game
      g.setCameraMode("manual")
      g.camera.position.set(2, 5, 40)
      g.camera.lookAt(-31, 10, 36)
    })
    await fakeBoard(false, "")(page)
    await sleep(800)
    await fakeBoard(true, "")(page)
    await sleep(1600)
    await shot("wide-start")
    await sleep(1500)
    await shot("wide-start-2")
    await fakeBoard(false, "u-pip")(page)
    await sleep(2600)
    await shot("wide-end")
    await sleep(2000)
    await shot("wide-end-2")
    await sleep(1600)
    await shot("wide-finale")
  },
  /** Draw calls and triangles near the stage: live with fireworks in the air, versus the stage show hidden. */
  async bench(page, shot) {
    const measure = (hide) =>
      page.evaluate((hide) => {
        const h = window.__harness
        const scene = [...h.world.zones.values()][0]?.group.parent
        const root = scene?.getObjectByName("stage-show")
        if (root && hide) scene.remove(root)
        const b = h.bench(2)
        if (root && hide) scene.add(root)
        const mine = Object.fromEntries(Object.entries(b.kinds).filter(([k]) => /fireworks|stage|\?|mesh:$/.test(k)))
        return { drawCalls: b.drawCalls, triangles: b.triangles, mine }
      }, hide)
    const out = {}
    for (const [name, x, z, yaw] of [["near", at[0], at[1], at[2]], ["plaza", 0, 38, 1.45], ["close", -19, 36.5, Math.PI / 2]]) {
      await teleport(page, x, z, yaw)
      await fakeBoard(false, "")(page)
      await sleep(600)
      await fakeBoard(true, "")(page)
      await sleep(2600)
      out[name + "-live-fireworks"] = await measure(false)
      out[name + "-without-show"] = await measure(true)
    }
    await shot("bench")
    console.log(JSON.stringify(out, null, 1))
  },
  /** Zone 0 unloads (the show is torn down) and loads again (rebuilt), mid-fireworks. */
  async unload(page, shot) {
    const probe = () =>
      page.evaluate(() => {
        const h = window.__harness
        let scene = null
        h.game.camera.traverseAncestors?.(() => {})
        for (const v of h.world.zones.values()) scene = v.group.parent
        const count = scene ? scene.children.filter((o) => o.name === "stage-show").length : -1
        return { zone0: h.world.zones.has(0), shows: count, zones: [...h.world.zones.keys()] }
      })
    await fakeBoard(true, "")(page)
    await sleep(500)
    const before = await probe()
    await teleport(page, 420, 52, 0)
    await page.waitForFunction(() => !window.__harness.world.zones.has(0) && window.__harness.world.zones.has(1), null, { timeout: 60000, polling: 200 })
    await fakeBoard(false, "u-pip")(page)
    await sleep(800)
    const away = await probe()
    await teleport(page, -12, 37, 1.62)
    await page.waitForFunction(() => window.__harness.world.zones.has(0), null, { timeout: 60000, polling: 200 })
    await sleep(1500)
    const back = await probe()
    await shot("rebuilt")
    console.log("unload", JSON.stringify({ before, away, back }))
  },
  /** From the plaza (the far view). */
  async plaza(page, shot) {
    await fakeBoard(true, "")(page)
    await teleport(page, 0, 38, 1.45)
    await sleep(1500)
    await shot("plaza")
  },
  /** Close up in front of the stage. */
  async close(page, shot) {
    await fakeBoard(true, "u-pip")(page)
    await teleport(page, -19, 36.5, Math.PI / 2)
    await sleep(1500)
    await shot("close")
  },
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
})
const report = []
for (const [shape, options] of Object.entries(SHAPES)) {
  if (only.length && !only.includes(shape)) continue
  mkdirSync(`shots/${shape}`, { recursive: true })
  for (const name of scenes.length ? scenes : Object.keys(SCENES)) {
    const context = await browser.newContext(options)
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push("http " + r.status() + " " + r.url())
    })
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text())
    })
    const shot = async (n) => {
      // new shader pipelines compile in the background: draw twice
      await page.evaluate(() => window.__harness?.render?.())
      await sleep(300)
      await page.evaluate(() => window.__harness?.render?.())
      await page.screenshot({ path: `shots/${shape}/stage-${phase}-${n}.png` })
    }
    let info = null
    try {
      await page.goto(BASE + `?save=mid&at=plaza&phase=${phase}&weather=clear&q=${process.env.Q ?? "high"}`)
      await page.waitForFunction(() => window.__harness?.store?.me && window.__harness.world?.zones.has(0), null, { timeout: 30000, polling: 100 })
      await teleport(page, at[0], at[1], at[2])
      await sleep(1500)
      await SCENES[name](page, shot)
      info = await page.evaluate(() => {
        const scene = [...window.__harness.world.zones.values()][0]?.group.parent
        const root = scene?.getObjectByName("stage-show")
        if (!root) return null
        const fw = root.getObjectByName("fireworks")
        let meshes = 0
        let tris = 0
        root.traverse((o) => {
          if (!o.isMesh || !o.visible) return
          meshes++
          const g = o.geometry
          const n = g.index ? g.index.count / 3 : g.getAttribute("position").count / 3
          tris += n * (g.instanceCount ?? 1)
        })
        return { visible: root.visible, meshes, tris: Math.round(tris), fireworks: fw ? { visible: fw.visible, sparks: fw.geometry.instanceCount } : null }
      })
    } catch (e) {
      errors.push("FLOW FAILED: " + String(e).split("\n")[0])
    }
    const missing = await page.evaluate(() => [...(window.__harness?.missing ?? [])]).catch(() => [])
    report.push({ shape, scene: name, errors: [...new Set(errors)].slice(0, 12), missing, info })
    await context.close()
  }
}
await browser.close()
writeFileSync("shots/stage-report.json", JSON.stringify(report, null, 1))
for (const r of report) console.log(r.shape, r.scene, r.errors.length ? r.errors : "ok", r.missing.length ? "missing: " + r.missing.join(",") : "", r.info ? JSON.stringify(r.info) : "")
