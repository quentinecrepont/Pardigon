import assert from "node:assert/strict";
import test from "node:test";
import { calculateFrameSchedule } from "../.test-dist/frameScheduler.js";

test("keeps 24 FPS close to its requested cadence on a 60 Hz display", () => {
  let previousRenderTimestamp = null;
  let renderedFrames = 0;
  let lateFrames = 0;

  for (let frame = 0; frame <= 60; frame += 1) {
    const schedule = calculateFrameSchedule(
      frame * (1_000 / 60),
      previousRenderTimestamp,
      24,
    );

    if (schedule.shouldRender) {
      renderedFrames += 1;
      lateFrames += schedule.lateFrames;
      previousRenderTimestamp = schedule.nextRenderTimestamp;
    }
  }

  assert.ok(renderedFrames >= 24 && renderedFrames <= 25);
  assert.equal(lateFrames, 0);
});

test("does not count intentionally skipped refreshes as late frames", () => {
  const schedule = calculateFrameSchedule(16.67, 0, 24);

  assert.equal(schedule.shouldRender, false);
  assert.equal(schedule.lateFrames, 0);
});

test("counts only missed frames from the selected grain cadence", () => {
  const schedule = calculateFrameSchedule(200, 0, 20);

  assert.equal(schedule.shouldRender, true);
  assert.equal(schedule.nextRenderTimestamp, 200);
  assert.equal(schedule.lateFrames, 3);
});
