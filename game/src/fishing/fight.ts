// The reel fight: a fish marker darts along a bar; holding lifts the green zone, releasing lets it fall.
// Fish inside the zone fills the catch meter, outside drains it. Numbers live in server/rules.ts (FIGHT)
// so the server can bound the fastest possible catch.
import { FIGHT, drainRate, fillRate } from "../../server/rules.ts"

export class Fight {
  /** 0..1 along the bar (left .. right). */
  zone = 0.5
  zoneVel = 0
  fish = 0.5
  fishTarget = 0.5
  progress = FIGHT.start
  perfect = true
  elapsed = 0
  done: "caught" | "escaped" | null = null
  /** Seconds the fish has been outside the zone (for feedback). */
  outside = 0
  private retarget = 0
  private dart = 0

  constructor(
    readonly d: number,
    readonly power: number,
    readonly width: number,
    readonly rng: () => number = Math.random,
  ) {}

  get inside(): boolean {
    return Math.abs(this.fish - this.zone) <= this.width / 2
  }

  update(dt: number, holding: boolean): void {
    if (this.done) return
    dt = Math.min(dt, 0.05)
    this.elapsed += dt
    // the player's zone
    this.zoneVel += (holding ? FIGHT.lift : -FIGHT.gravity) * dt
    this.zoneVel = Math.max(-FIGHT.maxSpeed, Math.min(FIGHT.maxSpeed, this.zoneVel))
    this.zone += this.zoneVel * dt
    const half = this.width / 2
    if (this.zone < half) {
      this.zone = half
      this.zoneVel = Math.max(0, this.zoneVel) * -0.25
    }
    if (this.zone > 1 - half) {
      this.zone = 1 - half
      this.zoneVel = Math.min(0, this.zoneVel) * -0.25
    }
    // the fish
    this.retarget -= dt
    if (this.retarget <= 0) {
      this.retarget = (FIGHT.retarget / (0.6 + 0.3 * this.d)) * (0.6 + this.rng() * 0.8)
      const reach = 0.25 + 0.12 * this.d
      this.fishTarget = Math.min(0.97, Math.max(0.03, this.fish + (this.rng() * 2 - 1) * reach))
      this.dart = this.rng() < 0.12 * this.d ? 1.8 : 1
    }
    const speed = (FIGHT.fishSpeed + FIGHT.fishSpeedPerD * this.d) * this.dart
    const delta = this.fishTarget - this.fish
    this.fish += Math.sign(delta) * Math.min(Math.abs(delta), speed * dt)
    // the meter
    if (this.inside) {
      this.progress += fillRate(this.d, this.power) * dt
      this.outside = 0
    } else {
      this.progress -= drainRate(this.d) * dt
      this.outside += dt
      if (this.elapsed > FIGHT.grace) this.perfect = false
    }
    if (this.progress >= 1) {
      this.progress = 1
      this.done = "caught"
    } else if (this.progress <= 0) {
      this.progress = 0
      this.done = "escaped"
    }
  }

  /** Auto-reel: hold while the fish is ahead of the zone (never perfect). */
  autoHold(): boolean {
    return this.fish > this.zone + this.zoneVel * 0.25
  }
}
