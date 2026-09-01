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
});

test("fails safely outside a browser", () => {
  assert.equal(isWebGL2Supported(), false);
  assert.throws(() => createGrain(), /navigateur/);
});
