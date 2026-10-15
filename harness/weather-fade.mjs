// Checks the weather fades: starts in a storm, jumps the page clock to a clear block, and samples the
// rain mesh's instance count and flash state for 3 s. Usage: node weather-fade.mjs
import { chromium } from "playwright-core"
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto("http://localhost:5199/?save=mid&at=pier&phase=day&weather=storm&q=high")
await page.waitForFunction(() => window.__harness?.store?.me && window.__harness.world?.zones.size > 0, null, { timeout: 60000 })
await page.waitForTimeout(3000)
const samples = await page.evaluate(async () => {
  const rules = await import("/@fs/home/user/Blombo/game/server/rules.ts")
  const scene = [...window.__harness.world.zones.values()][0].group.parent
  const rain = scene.getObjectByName("weather_rain")
  const ripples = scene.getObjectByName("weather_ripples")
  const base = Date.now.bind(Date)
  let shift = 0
  while (rules.skyAt(base() + shift).weather !== "clear" || rules.skyAt(base() + shift).phase !== "day") shift += rules.WEATHER_BLOCK_MS
  const out = [{ t: 0, rain: rain.geometry.instanceCount, ripples: ripples.geometry.instanceCount }]
  Date.now = () => base() + shift
  const t0 = performance.now()
  for (let i = 1; i <= 12; i++) {
    await new Promise((r) => setTimeout(r, 250))
    out.push({ t: Math.round(performance.now() - t0), rain: rain.geometry.instanceCount, visible: rain.visible, ripples: ripples.geometry.instanceCount })
  }
  return out
})
console.log(JSON.stringify(samples))
console.log("errors:", errors)
await browser.close()
