import assert from "node:assert/strict";
import test from "node:test";
import {
  createGrain,
  grainPresets,
  isWebGL2Supported,
} from "../dist/index.js";

test("exports the public API", () => {
  assert.equal(typeof createGrain, "function");
  assert.equal(typeof isWebGL2Supported, "function");
  assert.deepEqual(Object.keys(grainPresets), [
    "8mm",
    "16mm",
    "35mm",
    "paper",
    "pixel",
    "fog",
  ]);
});

test("keeps built-in presets immutable", () => {
  assert.equal(Object.isFrozen(grainPresets), true);
  assert.equal(Object.isFrozen(grainPresets["8mm"]), true);
  assert.equal(Object.isFrozen(grainPresets.fog), true);
  assert.equal(grainPresets.fog.color, "#ffffff");
  assert.equal(grainPresets["8mm"].blendMode, "normal");
  assert.equal(grainPresets.fog.blendMode, "normal");
  assert.equal(grainPresets["8mm"].character, 1);
  assert.equal(grainPresets["16mm"].character, 0.4);
  assert.equal(grainPresets["35mm"].character, 0);
  assert.equal(grainPresets.paper.character, 0.12);
  assert.equal(grainPresets.pixel.character, 0);
  assert.equal(grainPresets.fog.character, 0.63);
  assert.equal(grainPresets["8mm"].continuity, 0.2);
  assert.equal(grainPresets["16mm"].continuity, 0.1);
  assert.equal(grainPresets.fog.continuity, 0);
  assert.equal(grainPresets["8mm"].flicker, 0.18);
  assert.equal(grainPresets["16mm"].flicker, 0.12);
  assert.equal(grainPresets.fog.flicker, 0);
  assert.equal(grainPresets["8mm"].dirt, 0.4);
  assert.equal(grainPresets["16mm"].dirt, 0.08);
  assert.equal(grainPresets.fog.dirt, 0);
});

test("fails safely outside a browser", () => {
  assert.equal(isWebGL2Supported(), false);
  assert.throws(() => createGrain(), /navigateur/);
});
