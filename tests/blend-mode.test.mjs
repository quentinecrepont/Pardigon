import assert from "node:assert/strict";
import test from "node:test";
import { resolveBlendMode } from "../.test-dist/blendMode.js";

test("keeps a supported blend mode", () => {
  assert.equal(resolveBlendMode("soft-light", () => true), "soft-light");
});

test("falls back when a blend mode is unsupported", () => {
  assert.equal(resolveBlendMode("overlay", () => false), "normal");
});

test("falls back when a blend mode is invalid", () => {
  assert.equal(resolveBlendMode("difference", () => true), "normal");
});

test("always accepts the normal blend mode", () => {
  assert.equal(resolveBlendMode("normal", () => false), "normal");
});
