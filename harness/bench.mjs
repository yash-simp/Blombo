// Draw calls, triangles and software-rendered frame time from the spawn camera, phone portrait.
// Usage: node bench.mjs [label] [query]
import { chromium } from "playwright-core"
const label = process.argv[2] ?? "run"
const query = process.argv[3] ?? "save=new&phase=day&weather=clear"
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
const out = {}
for (const [shape, opts] of Object.entries({
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
})) {
  const page = await browser.newPage(opts)
  await page.goto("http://localhost:5199/?" + query)
  await page.waitForFunction(() => window.__harness?.store?.me && window.__harness.world?.zones.size > 0 && window.__harness.bench, null, { timeout: 60000 })
  await page.waitForTimeout(2500)
  out[shape] = await page.evaluate(() => window.__harness.bench(8))
  await page.close()
}
await browser.close()
console.log(label, JSON.stringify(out, null, 1))
