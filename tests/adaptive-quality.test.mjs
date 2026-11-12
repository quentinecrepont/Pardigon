import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_ADAPTIVE_QUALITY,
  evaluateQualitySample,
  interruptQualitySampling,
} from "../.test-dist/adaptiveQuality.js";

const MAX_LEVEL = 3;

/** One 1-second sample of identical frame intervals. */
const sampleOf = (intervalMs) =>
  Array.from({ length: Math.round(1_000 / intervalMs) }, () => intervalMs);

/** Runs samples whose frame interval depends on the current quality level. */
function simulate(samples, intervalForLevel, state = INITIAL_ADAPTIVE_QUALITY) {
  const levels = [];
  let current = state;
  for (let index = 0; index < samples; index += 1) {
    current = evaluateQualitySample(
      current,
      sampleOf(intervalForLevel(current.level)),
      MAX_LEVEL,
    );
    levels.push(current.level);
  }
  return { state: current, levels };
}

test("keeps full quality on a stable 60 Hz display", () => {
  const { levels } = simulate(12, () => 1_000 / 60);
  assert.deepEqual(levels, Array(12).fill(0));
});

test("keeps full quality when the browser caps frames at 30 Hz", () => {
  const { state, levels } = simulate(15, () => 1_000 / 30);

  // One probe sample at the lowest level, then full quality for good.
  assert.equal(levels.filter((level) => level !== 0).length, 1);
  assert.equal(state.level, 0);
  assert.ok(Math.abs(state.baselineIntervalMs - 1_000 / 30) < 0.5);
});

test("lowers quality when Pardigon causes the slowdown", () => {
  // Levels 0 and 1 are too heavy for this device; level 2 runs smoothly.
  const { levels } = simulate(6, (level) => (level < 2 ? 1_000 / 30 : 1_000 / 60));
  assert.equal(levels.at(-1), 2);
});

test("forgets a 30 Hz cap when the display speeds up again", () => {
  const capped = simulate(6, () => 1_000 / 30).state;
  const recovered = simulate(1, () => 1_000 / 60, capped).state;
  assert.ok(Math.abs(recovered.baselineIntervalMs - 1_000 / 60) < 0.01);

  // A new cap is detected again instead of lowering quality for good.
  const cappedAgain = simulate(10, () => 1_000 / 30, recovered).state;
  assert.equal(cappedAgain.level, 0);
});

test("restores the previous level when a probe is interrupted", () => {
  const probing = simulate(2, () => 1_000 / 30).state;
  assert.equal(probing.level, MAX_LEVEL);

  const interrupted = interruptQualitySampling(probing);
  assert.equal(interrupted.level, 0);
  assert.equal(interrupted.probe, null);
});
