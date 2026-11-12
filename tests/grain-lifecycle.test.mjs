import assert from "node:assert/strict";
import test from "node:test";
import { createGrain } from "../dist/index.js";
import { grainCanvasOf, installFakeBrowser } from "./fake-browser.mjs";

test("the fake browser drives an animated grain", () => {
  const browser = installFakeBrowser();
  const target = browser.createTarget();
  createGrain({ target });
  const { gl } = grainCanvasOf(target);
  const draws = gl.draws;

  browser.advance(1_000);

  assert.ok(gl.draws - draws >= 23, `only ${gl.draws - draws} frames drawn`);
  assert.equal(browser.pendingFrames(), 1);
});

test("ends a quality probe when the grain becomes static", () => {
  const browser = installFakeBrowser();
  const target = browser.createTarget();
  const grain = createGrain({ target, quality: "auto" });
  // Two slow samples start a probe at the lowest quality level.
  browser.advance(2_200, 1_000 / 30);
  assert.equal(grain.getMetrics().qualityLevel, 3);

  grain.update({ animated: false });

  assert.equal(grain.getMetrics().qualityLevel, 0);
  assert.equal(grainCanvasOf(target).width, target.clientWidth);
});

test("does not start an empty loop after a failed context restore", (t) => {
  t.mock.method(console, "error", () => {});
  const browser = installFakeBrowser();
  const target = browser.createTarget();
  const grain = createGrain({ target });
  const canvas = grainCanvasOf(target);

  canvas.gl.lost = true;
  canvas.dispatch("webglcontextlost");
  canvas.gl.lost = false;
  canvas.gl.failSetup = true;
  canvas.dispatch("webglcontextrestored");
  grain.play();

  assert.equal(browser.pendingFrames(), 0);
});

test("does not render a hidden grain when its video advances", () => {
  const browser = installFakeBrowser();
  const target = browser.createTarget();
  const video = browser.createVideo();
  createGrain({ target, luminance: { source: video } });
  const { gl } = grainCanvasOf(target);
  browser.setHidden(true);
  const draws = gl.draws;

  video.currentTime = 1;
  video.dispatch("timeupdate");

  assert.equal(gl.draws, draws);
});

test("refreshes a static grain from a video that advanced while hidden", () => {
  const browser = installFakeBrowser();
  const target = browser.createTarget();
  const video = browser.createVideo();
  createGrain({ target, animated: false, luminance: { source: video } });
  const { gl } = grainCanvasOf(target);
  browser.setHidden(true);
  video.currentTime = 1;
  video.dispatch("timeupdate");
  const videoUploads = () => gl.uploads.filter((source) => source === video).length;
  const uploadsWhileHidden = videoUploads();

  browser.setHidden(false);

  assert.equal(videoUploads(), uploadsWhileHidden + 1);
});

test("leaves nothing behind when setup fails after attaching the canvas", () => {
  const browser = installFakeBrowser();
  const target = browser.createTarget();

  // The fake browser has no 2D contexts, so the text mask cannot be drawn.
  assert.throws(
    () => createGrain({ target, mask: "text" }),
    /could not create the text mask/,
  );

  assert.deepEqual(target.children, []);
  assert.equal(target.style.position, "");
  assert.equal(browser.window.listenerCount(), 0);
  assert.equal(browser.document.listenerCount(), 0);
  assert.equal(browser.canvases[0].gl.lost, true);
});
