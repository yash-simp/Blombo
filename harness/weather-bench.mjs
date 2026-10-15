// Draw calls and triangles with and without the weather group, phone portrait and landscape.
// Usage: node weather-bench.mjs [query]
import { chromium } from "playwright-core"
const query = process.argv[2] ?? "save=mid&at=pier&phase=day&weather=storm&q=high"
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
const out = {}
for (const [shape, opts] of Object.entries({
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
})) {
  const page = await browser.newPage(opts)
  await page.goto("http://localhost:5199/?" + query)
  await page.waitForFunction(() => window.__harness?.store?.me && window.__harness.world?.zones.size > 0 && window.__harness.bench, null, { timeout: 60000 })
  await page.waitForTimeout(3500)
  for (const on of [false, true]) {
    out[shape + (on ? " weather" : " no-weather")] = await page.evaluate((on) => {
      const scene = [...window.__harness.world.zones.values()][0].group.parent
      scene.getObjectByName("weather").visible = on
      const r = window.__harness.bench(4)
      const flash = scene.getObjectByName("weather_flash_sky").visible
      return { drawCalls: r.drawCalls, triangles: r.triangles, msPerFrame: r.msPerFrame, flashing: flash }
    }, on)
  }
  await page.close()
}
await browser.close()
console.log(query, JSON.stringify(out, null, 1))
