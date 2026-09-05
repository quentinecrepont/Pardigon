import assert from "node:assert/strict";
import test from "node:test";
import { calculateFlickerExposure } from "../.test-dist/flicker.js";

test("keeps flicker disabled at zero", () => {
  assert.equal(calculateFlickerExposure(10, 0, 24, 1), 0);
});

test("keeps flicker exposure inside its subtle safety bound", () => {
  for (let sample = 0; sample < 2_000; sample += 1) {
    const exposure = calculateFlickerExposure(sample / 60, 1, 60, 3);
    assert.ok(exposure >= -0.09 && exposure <= 0.09);
  }
});

test("creates a deterministic but changing temporal signal", () => {
  const first = calculateFlickerExposure(2.5, 0.7, 24, 1);
  const repeated = calculateFlickerExposure(2.5, 0.7, 24, 1);
  const later = calculateFlickerExposure(2.75, 0.7, 24, 1);

  assert.equal(first, repeated);
  assert.notEqual(first, later);
});
