// Plays Lantern Lake in the harness (real client + real server code) and saves screenshots in three
// screen shapes (desktop, phone landscape). Usage: node shots.mjs [flow ...] [--only=desktop,landscape]
// Shots land in ./shots/<shape>/<nn-name>.png; page errors and missing text keys are reported.
import { chromium } from "playwright-core"
import { mkdirSync, writeFileSync } from "node:fs"

const BASE = "http://localhost:5199/"
const SHAPES = {
  desktop: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, hasTouch: false },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
}
const args = process.argv.slice(2)
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean)
const flows = args.filter((a) => !a.startsWith("--"))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(page, fn, arg, timeout = 15000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 100 })
}
const teleport = (page, x, z, yaw) =>
  page.evaluate(([x, z, yaw]) => {
    const h = window.__harness
    h.player.x = x
    h.player.z = z
    h.player.yaw = yaw
    h.game.player.position.set(x, 1, z)
  }, [x, z, yaw])
const click = (page, selector) => page.locator(selector).first().click({ force: true })

/** Strikes from inside the page the moment the bobber dips (a slow software renderer would miss it). */
async function autoHook(page, delayMs = 350) {
  await page.evaluate((delayMs) => {
    const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: "KeyE", key: "e" }))
    const id = setInterval(() => {
      if (window.__harness.fishUi.phase !== "bite") return
      clearInterval(id)
      window.__harness.bitten = true
      setTimeout(() => {
        key("keydown")
        key("keyup")
      }, delayMs)
    }, 10)
  }, delayMs)
}

/** Holds E while the fish is ahead of the green zone, like a decent player. */
async function reelBot(page) {
  await page.evaluate(() => {
    let holding = false
    const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: "KeyE", key: "e" }))
    const id = setInterval(() => {
      const ui = window.__harness.fishUi
      if (ui.phase !== "reeling" || !ui.fight) {
        if (holding) key("keyup")
        holding = false
        if (ui.phase === "idle" || ui.catchCard) clearInterval(id)
        return
      }
      const want = ui.fight.fish > ui.fight.zone
      if (want !== holding) key(want ? "keydown" : "keyup")
      holding = want
    }, 16)
  })
}

const FLOWS = {
  /** The first minute: guide → rod → first cast → FIRST CATCH → gift → sell. */
  async first(page, shot) {
    await page.goto(BASE + "?save=new&phase=day&weather=clear")
    await until(page, () => window.__harness?.store?.me && window.__harness.world?.zones.size > 0)
    await shot("01-join")
    await until(page, () => window.__harness.store.me.tut === 1)
    await sleep(350)
    await shot("02-rod-gift")
    await sleep(3200)
    await teleport(page, 0, -5.5, 0)
    await sleep(1500)
    await shot("03-goal-first-cast")
    await page.keyboard.down("e")
    await sleep(650)
    await shot("04-charging")
    await page.keyboard.up("e")
    await sleep(500)
    await shot("05-cast")
    await autoHook(page)
    await until(page, () => window.__harness.fishUi.phase === "bite" || window.__harness.bitten)
    await shot("06-bite")
    await until(page, () => window.__harness.fishUi.phase === "reeling", null, 20000)
    await reelBot(page)
    await sleep(900)
    await shot("07-reeling")
    await until(page, () => !!window.__harness.fishUi.catchCard, null, 20000)
    await sleep(700)
    await shot("08-first-catch")
    await sleep(2200)
    await shot("09-first-catch-later")
    await click(page, ".catch .big, .catch button")
    await sleep(800)
    await shot("10-goal-gift")
    await click(page, ".goal")
    await sleep(1200)
    await shot("11-gift")
    await sleep(3500)
    await teleport(page, -12, 25.5, 0.3)
    await sleep(1200)
    await shot("12-market")
    await click(page, ".counter--bag")
    await sleep(600)
    await shot("13-bag-at-market")
    await click(page, ".bag .big")
    await sleep(900)
    await shot("14-sold")
  },
  /** A few minutes in: HUD and every card. */
  async cards(page, shot) {
    await page.goto(BASE + "?save=mid&at=pier&phase=day&weather=rain")
    await until(page, () => window.__harness?.store?.me && window.__harness.world?.zones.size > 0)
    await sleep(1200)
    await shot("20-hud")
    for (const [n, name, sel] of [
      ["21", "shop", '.menu__b[aria-label="' + "Shop" + '"]'],
      ["22", "index", ".menu__b:nth-child(2)"],
      ["23", "quests", ".menu__b:nth-child(3)"],
      ["24", "travel", ".menu__b:nth-child(4)"],
      ["25", "profile", ".me"],
      ["26", "bag", ".counter--bag"],
    ]) {
      await click(page, sel.startsWith(".menu__b[") ? ".menu__b:nth-child(1)" : sel)
      await sleep(500)
      await shot(`${n}-${name}`)
      await click(page, ".card__close")
      await sleep(300)
    }
  },
  async shop(page, shot) {
    await page.goto(BASE + "?save=mid&at=market&phase=day&weather=clear")
    await until(page, () => window.__harness?.store?.me && window.__harness.world?.zones.size > 0)
    await sleep(800)
    await click(page, ".menu__b:nth-child(1)")
    await sleep(400)
    await page.locator(".tabs button", { hasText: "Bait" }).first().click({ force: true })
    await sleep(400)
    await shot("27-shop-bait")
    await page.locator(".tabs button", { hasText: "Blogem" }).first().click({ force: true })
    await sleep(500)
    await shot("28-shop-blogems")
    await click(page, ".card__close")
    await click(page, ".counter--bag")
    await sleep(500)
    await shot("29-bag-sale-offer")
  },
  async night(page, shot) {
    await page.goto(BASE + "?save=mid&at=plaza&phase=night")
    await until(page, () => window.__harness?.store?.me && window.__harness.world?.zones.size > 0)
    await sleep(1500)
    await shot("30-night-plaza")
    await teleport(page, -14, 2, -0.4)
    await sleep(1200)
    await shot("31-night-shore")
  },
  /** Each water, from its harbour square looking inland (and Frost from its ice). */
  async zones(page, shot) {
    await page.goto(BASE + "?save=late&at=pier&phase=day&weather=clear")
    await until(page, () => window.__harness?.store?.me && window.__harness.world?.zones.size > 0)
    const spots = [["50-willow", 420, 0, 52, 0], ["51-coral", 840, 0, 52, 0], ["52-frost", 0, 420, 20, 0], ["53-ember", 420, 420, 52, 0], ["54-moon", 840, 420, 40, 0], ["55-willow-mill", 420, 0, -2, 1.4]]
    for (const [name, cx, cz, dz, yaw] of spots) {
      await teleport(page, cx + (name.endsWith("mill") ? 26 : 0), cz + dz, yaw)
      await until(page, (k) => window.__harness.world.zones.has(k), [0, 420, 840].indexOf(cx) + (cz ? 3 : 0), 30000)
      await sleep(1500)
      await shot(name)
    }
  },
  async home(page, shot) {
    await page.goto(BASE + "?save=late&at=pier&phase=dusk")
    await until(page, () => window.__harness?.store?.me && window.__harness.world?.zones.size > 0)
    const plot = await page.evaluate(() => {
      const me = window.__harness.store.me
      return window.__harness.world.zones.get(0).data.anchors.plots[me.plot]
    })
    await page.evaluate(() => {
      const s = window.__harness.store
      s.tourney = { ...(s.tourney ?? {}), crown: s.userId }
    })
    const side = plot[0] < -34 || (plot[0] > 0 && plot[0] < 34) ? -1 : 1
    await teleport(page, plot[0] - side * 4.2, plot[2] - 3.5, side > 0 ? -2.2 : 2.2)
    await sleep(4000)
    await shot("60-home-aquarium")
  },
  /** One island (ZONE=<key>): from the harbour square, a side lookout and a far view. Shots: zone-<key>-*. */
  async zone(page, shot) {
    const key = process.env.ZONE ?? "willow"
    const centres = { lantern: [0, 0, 0], willow: [420, 0, 1], coral: [840, 0, 2], frost: [0, 420, 3], ember: [420, 420, 4], moon: [840, 420, 5] }
    const [cx, cz, index] = centres[key]
    const phase = process.env.PHASE ?? "day"
    await page.goto(BASE + `?save=late&at=pier&phase=${phase}&weather=clear`)
    await until(page, () => window.__harness?.store?.me && window.__harness.world?.zones.size > 0)
    const spots = (process.env.SPOTS ?? "0,52,0;0,20,0;-40,10,0.9;40,10,-0.9;0,70,0").split(";").map((s) => s.split(",").map(Number))
    let k = 0
    for (const [dx, dz, yaw] of spots) {
      await teleport(page, cx + dx, cz + dz, yaw)
      await until(page, (i) => window.__harness.world.zones.has(i), index, 30000)
      await sleep(1500)
      await shot(`zone-${key}-${phase}-${k++}`)
    }
  },
  async ride(page, shot) {
    await page.goto(BASE + "?save=mid&at=captain&phase=day")
    await until(page, () => window.__harness?.store?.me && window.__harness.world?.zones.size > 0)
    await sleep(1200)
    await shot("40-captain")
    await click(page, ".menu__b:nth-child(4)")
    await sleep(500)
    await shot("41-travel-at-dock")
    await page.locator(".travel .pill:not([disabled])").first().click({ force: true })
    await sleep(1500)
    await shot("42-ride")
    await sleep(2400)
    await shot("43-ride-later")
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
  for (const flow of flows.length ? flows : Object.keys(FLOWS)) {
    const context = await browser.newContext(options)
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text())
    })
    const shot = async (name) => {
      await page.evaluate(() => window.__harness?.render?.())
      await page.screenshot({ path: `shots/${shape}/${name}.png` })
    }
    try {
      await FLOWS[flow](page, shot)
    } catch (e) {
      errors.push("FLOW FAILED: " + String(e).split("\n")[0])
      await shot("zz-failed-" + flow).catch(() => {})
    }
    const missing = await page.evaluate(() => [...(window.__harness?.missing ?? [])]).catch(() => [])
    report.push({ shape, flow, errors: [...new Set(errors)].slice(0, 12), missing })
    await context.close()
  }
}
await browser.close()
writeFileSync("shots/report.json", JSON.stringify(report, null, 1))
for (const r of report) console.log(r.shape, r.flow, r.errors.length ? r.errors : "ok", r.missing.length ? "missing: " + r.missing.join(",") : "")
