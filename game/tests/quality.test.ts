// The automatic graphics level: slow devices step down to low; smooth ones stay high; a choice sticks.
import { test } from "node:test"
import assert from "node:assert/strict"
import { LEVELS, quality, setQualityMode, settings, watchFrame } from "../src/world/quality.ts"

const run = (fps: number, seconds: number) => {
  for (let i = 0; i < fps * seconds; i++) watchFrame(1 / fps)
}

test("auto mode keeps high quality on a smooth device", () => {
  setQualityMode("auto")
  run(60, 30)
  assert.equal(quality.level, "high")
  assert.equal(quality.fps, 60)
})

test("auto mode steps down to low when the frame rate stays low", () => {
  setQualityMode("auto")
  run(60, 8)
  run(28, 13)
  assert.equal(quality.level, "low")
  assert.equal(settings().shadows, false)
  assert.ok(settings().renderScale < 1)
})

test("one slow moment is not enough, and a chosen level never changes by itself", () => {
  setQualityMode("auto")
  run(60, 8)
  run(25, 4)
  run(60, 8)
  assert.equal(quality.level, "high")
  setQualityMode("high")
  run(20, 30)
  assert.equal(quality.level, "high")
  setQualityMode("low")
  assert.equal(quality.level, "low")
})

test("low quality draws less than high everywhere", () => {
  const { high, low } = LEVELS
  assert.ok(low.clutter < high.clutter && low.detail < high.detail && low.terrain < high.terrain)
})
