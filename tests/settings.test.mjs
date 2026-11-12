import assert from "node:assert/strict";
import test from "node:test";
import { grainPresets } from "../.test-dist/presets.js";
import {
  DEFAULT_SETTINGS,
  normalizeHexColor,
  resolveMaskMode,
  resolvePreset,
  resolveQualityMode,
  resolveSettings,
} from "../.test-dist/settings.js";

const supportsEverything = () => true;

test("keeps base values for undefined options", () => {
  const settings = resolveSettings(
    { intensity: 0.5, complexity: undefined },
    grainPresets.fog,
    supportsEverything,
  );
  assert.equal(settings.intensity, 0.5);
  assert.equal(settings.complexity, grainPresets.fog.complexity);
  assert.equal(settings.animationMode, "flow");
});

test("clamps values to their documented ranges", () => {
  const settings = resolveSettings(
    { intensity: 2, fps: 120, size: 0, speed: 0, scaleX: 0, blur: -1 },
    DEFAULT_SETTINGS,
    supportsEverything,
  );
  assert.equal(settings.intensity, 1);
  assert.equal(settings.fps, 60);
  assert.equal(settings.size, 0.1);
  assert.equal(settings.speed, 0.05);
  assert.equal(settings.scaleX, 1);
  assert.equal(settings.blur, 0);
});

test("rejects numbers that would break the shader", () => {
  assert.throws(() => resolveSettings({ intensity: Number.NaN }, DEFAULT_SETTINGS), /intensity/);
  assert.throws(() => resolveSettings({ size: Infinity }, DEFAULT_SETTINGS), /size/);
  assert.throws(() => resolveSettings({ fps: "24" }, DEFAULT_SETTINGS), /fps/);
});

test("rejects unknown names instead of ignoring them", () => {
  assert.throws(() => resolveSettings({ animationMode: "drift" }, DEFAULT_SETTINGS), /animationMode/);
  assert.throws(() => resolveSettings({ animated: "yes" }, DEFAULT_SETTINGS), /animated/);
  assert.throws(() => resolveQualityMode("high"), /quality/);
  assert.throws(() => resolveMaskMode("circle"), /mask/);
  assert.throws(() => resolvePreset("super8"), /preset/);
  assert.throws(() => normalizeHexColor("red"), /color/);
  assert.throws(() => normalizeHexColor(0xffffff), /color/);
});

test("normalizes colours and resolves defaults", () => {
  assert.equal(normalizeHexColor(" #ABC "), "#aabbcc");
  assert.equal(resolveQualityMode(undefined), "fixed");
  assert.equal(resolveMaskMode(undefined), "none");
  assert.equal(resolvePreset(undefined), undefined);
});

test("falls back to normal for unsupported blend modes", () => {
  assert.equal(
    resolveSettings({ blendMode: "overlay" }, DEFAULT_SETTINGS, () => false).blendMode,
    "normal",
  );
  assert.equal(
    resolveSettings({ blendMode: "difference" }, DEFAULT_SETTINGS, supportsEverything).blendMode,
    "normal",
  );
});
