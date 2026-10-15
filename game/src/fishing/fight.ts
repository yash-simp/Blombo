// The reel fight: tap to reel. Every tap fills the catch meter, the fish pulls it down all the time
// and harder in short surges. Full = caught, empty = escaped. Numbers live in server/rules.ts (FIGHT) so
// the server can bound the fastest possible catch.
import { FIGHT, pullRate, tapGain } from "../../server/rules.ts"

export class Fight {
  /** The catch meter, 0..1. */
  progress = FIGHT.start
  perfect = true
  elapsed = 0
  done: "caught" | "escaped" | null = null
  /** Taps so far. */
  taps = 0
  /** Seconds since the last tap (the rod jerk and the HUD bump follow it). */
  sinceTap = 9
  /** Seconds left of the fish's current surge (0 = its steady pull). */
  surge = 0
  private lastTap = -1
  private nextSurge: number
  private nextAuto = 0

  constructor(
    readonly d: number,
    /** Gear power: rules tapPower of the rod and reel. */
    readonly power: number,
    readonly rng: () => number = Math.random,
  ) {
    this.nextSurge = this.surgeGap()
  }

  private surgeGap(): number {
    return FIGHT.surgeEvery * (0.7 + this.rng() * 0.6)
  }

  /**
   * One tap on the reel (false once the fight is over). Every tap counts, but the meter fills at most one full
   * tap per FIGHT.tapGap: a tap sooner than that after the last is worth its share, so tapping faster never
   * reels slower and auto-clickers gain nothing.
   */
  tap(): boolean {
    if (this.done) return false
    const share = this.lastTap < 0 ? 1 : Math.min(1, (this.elapsed - this.lastTap) / FIGHT.tapGap)
    this.lastTap = this.elapsed
    this.taps++
    this.sinceTap = 0
    this.progress = Math.min(1, this.progress + tapGain(this.d, this.power) * share)
    if (this.progress >= 1) this.done = "caught"
    return true
  }

  /** Auto-Reel taps at a steady FIGHT.autoRate (the player's own taps still count too). */
  update(dt: number, auto = false): void {
    if (this.done) return
    dt = Math.min(dt, 0.05)
    this.elapsed += dt
    this.sinceTap += dt
    if (auto) {
      this.nextAuto -= dt
      if (this.nextAuto <= 0) {
        this.nextAuto += 1 / FIGHT.autoRate
        this.tap()
        if (this.done) return
      }
    }
    // the fish: a steady pull with a surge now and then, from the first tap (or once it has waited)
    if (this.taps === 0 && this.elapsed < FIGHT.wait) return
    if (this.surge > 0) this.surge = Math.max(0, this.surge - dt)
    else {
      this.nextSurge -= dt
      if (this.nextSurge <= 0) {
        this.surge = FIGHT.surgeTime
        this.nextSurge = this.surgeGap()
      }
    }
    this.progress -= pullRate(this.d) * (this.surge > 0 ? FIGHT.surgeMult : 1) * dt
    if (this.elapsed > FIGHT.grace && this.progress < FIGHT.start) this.perfect = false
    if (this.progress <= 0) {
      this.progress = 0
      this.done = "escaped"
    }
  }
}
