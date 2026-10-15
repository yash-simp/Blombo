// Weather visuals in the harness: rain, storm (with a lightning flash), aurora and Frost Lake snow,
// in phone portrait and landscape. Usage: node weather-shots.mjs [scene ...] [--only=portrait,landscape]
// Shots land in ./shots/<shape>/wx-<scene>.png; errors and weather mesh state go to shots/weather-report.json.
import { chromium } from "playwright-core"
import { mkdirSync, writeFileSync } from "node:fs"

const BASE = "http://localhost:5199/"
const SHAPES = {
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
}
const SCENES = {
  rain: "save=mid&at=pier&phase=day&weather=rain&q=high",
  storm: "save=mid&at=pier&phase=day&weather=storm&q=high",
  aurora: "save=mid&at=pier&phase=night&weather=aurora&q=high",
  frost: "save=late&at=frost&phase=day&weather=rain&q=high",
  blizzard: "save=late&at=frost&phase=day&weather=storm&q=high",
  nightrain: "save=mid&at=pier&phase=night&weather=rain&q=high",
  lowstorm: "save=mid&at=pier&phase=day&weather=storm&q=low",
  clear: "save=mid&at=pier&phase=day&weather=clear&q=high",
}
const args = process.argv.slice(2)
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean)
const scenes = args.filter((a) => !a.startsWith("--"))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The weather group's meshes: visibility and instance counts. */
const probe = (page) =>
  page.evaluate(() => {
    const h = window.__harness
    const scene = [...h.world.zones.values()][0]?.group.parent
    const root = scene?.getObjectByName("weather")
    if (!root) return null
    const out = {}
    for (const m of root.children) out[m.name] = { visible: m.visible, count: m.geometry.instanceCount ?? null, range: m.geometry.drawRange?.count }
    return out
  })

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
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text())
    })
    // new shader pipelines compile in the background and are skipped until ready: warm up first
    const warm = async () => {
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.__harness?.render?.())
        await sleep(400)
      }
    }
    const shot = async (file) => {
      await page.evaluate(() => window.__harness?.render?.())
      await page.screenshot({ path: `shots/${shape}/${file}.png` })
    }
    let state = null
    try {
      await page.goto(BASE + "?" + SCENES[name])
      await page.waitForFunction(() => window.__harness?.store?.me && window.__harness.world?.zones.size > 0, null, { timeout: 60000, polling: 100 })
      if (name === "frost" || name === "blizzard") await page.waitForFunction(() => window.__harness.world.zones.has(3), null, { timeout: 60000, polling: 200 })
      await sleep(3500)
      await warm()
      await shot(`wx-${name}`)
      state = await probe(page)
      if (name === "storm" || name === "lowstorm") {
        // render the moment a strike begins (the flash lasts well under a second); the first strike
        // only compiles the flash shaders, the second is the shot
        const strike = () =>
          page.evaluate(
            () =>
              new Promise((resolve) => {
                const scene = [...window.__harness.world.zones.values()][0].group.parent
                const sky = scene.getObjectByName("weather_flash_sky")
                let was = sky.visible
                // the storm can end (the page clock only starts inside a storm block): give up after 25 s
                const started = performance.now()
                const id = setInterval(() => {
                  if (performance.now() - started > 25000) {
                    clearInterval(id)
                    resolve(false)
                    return
                  }
                  const now = sky.visible
                  if (now && !was) {
                    clearInterval(id)
                    window.__harness.render()
                    resolve(true)
                  }
                  was = now
                }, 5)
              }),
          )
        await strike()
        await strike()
        await page.screenshot({ path: `shots/${shape}/wx-${name}-flash.png` })
        // again under a dark storm sky (the mock engine keeps its pale day sky in storms)
        await page.evaluate(() => {
          const scene = [...window.__harness.world.zones.values()][0].group.parent
          for (const o of scene.children) if (o.geometry?.parameters?.radius === 1500) o.visible = false
          scene.background.set(0x3a4656)
        })
        await strike()
        await page.screenshot({ path: `shots/${shape}/wx-${name}-flash-dark.png` })
      }
      if (name === "aurora") {
        // the mock engine keeps a day sky at night: darken it to judge the aurora as players see it
        await page.evaluate(() => {
          const scene = [...window.__harness.world.zones.values()][0].group.parent
          for (const o of scene.children) if (o.geometry?.parameters?.radius === 1500) o.visible = false
          scene.background.set(0x0b1430)
        })
        await warm()
        await shot(`wx-aurora-dark`)
        await page.evaluate(() => {
          const h = window.__harness
          h.player.x = 0
          h.player.z = -100
          h.player.yaw = 0
          h.game.player.position.set(0, 1, -100)
        })
        await sleep(1500)
        await warm()
        await shot(`wx-aurora-north`)
      }
    } catch (e) {
      errors.push("FAILED: " + String(e).split("\n")[0])
    }
    report.push({ shape, name, errors: [...new Set(errors)].slice(0, 12), state })
    await context.close()
  }
}
await browser.close()
writeFileSync("shots/weather-report.json", JSON.stringify(report, null, 1))
for (const r of report) console.log(r.shape, r.name, r.errors.length ? r.errors : "ok", JSON.stringify(r.state))
