import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanvasFont,
  resolveAnchorX,
  resolveFontStretch,
  resolveTextAlign,
} from "../.test-dist/textMask.js";

test("keeps physical text alignments", () => {
  assert.equal(resolveTextAlign("left", "rtl"), "left");
  assert.equal(resolveTextAlign("right", "ltr"), "right");
  assert.equal(resolveTextAlign("center", "rtl"), "center");
  assert.equal(resolveTextAlign("-webkit-center", "ltr"), "center");
});

test("resolves logical text alignments from the writing direction", () => {
  assert.equal(resolveTextAlign("start", "ltr"), "left");
  assert.equal(resolveTextAlign("start", "rtl"), "right");
  assert.equal(resolveTextAlign("end", "ltr"), "right");
  assert.equal(resolveTextAlign("end", "rtl"), "left");
  assert.equal(resolveTextAlign("justify", "rtl"), "right");
});

test("anchors the canvas text on the measured line edges", () => {
  assert.equal(resolveAnchorX("left", 40, 260), 40);
  assert.equal(resolveAnchorX("right", 40, 260), 260);
  assert.equal(resolveAnchorX("center", 40, 260), 150);
});

test("maps computed font-stretch values to canvas keywords", () => {
  assert.equal(resolveFontStretch("100%"), "normal");
  assert.equal(resolveFontStretch("75%"), "condensed");
  assert.equal(resolveFontStretch("80%"), "condensed");
  assert.equal(resolveFontStretch("125%"), "expanded");
  assert.equal(resolveFontStretch("semi-expanded"), "semi-expanded");
  assert.equal(resolveFontStretch("unexpected"), "normal");
});

test("builds a canvas font that ignores non-CSS2 font variants", () => {
  const style = {
    fontStyle: "italic",
    fontVariantCaps: "normal",
    fontWeight: "700",
    fontSize: "32px",
    fontFamily: "\"Inter\", sans-serif",
  };

  assert.equal(
    buildCanvasFont(style),
    "italic normal 700 32px \"Inter\", sans-serif",
  );
  assert.equal(
    buildCanvasFont({ ...style, fontVariantCaps: "small-caps" }),
    "italic small-caps 700 32px \"Inter\", sans-serif",
  );
  assert.equal(
    buildCanvasFont({ ...style, fontVariantCaps: "all-small-caps" }),
    "italic normal 700 32px \"Inter\", sans-serif",
  );
});
