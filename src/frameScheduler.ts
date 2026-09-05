const FRAME_SCHEDULE_TOLERANCE_MS = 0.5;

export interface FrameSchedule {
  shouldRender: boolean;
  nextRenderTimestamp: number | null;
  lateFrames: number;
}

/**
 * Keeps a requested grain cadence aligned to its ideal timeline.
 * Carrying the remaining time avoids turning 24 FPS into 20 FPS on a 60 Hz display.
 */
export function calculateFrameSchedule(
  timestamp: number,
  previousRenderTimestamp: number | null,
  targetFps: number,
): FrameSchedule {
  if (previousRenderTimestamp === null) {
    return {
      shouldRender: true,
      nextRenderTimestamp: timestamp,
      lateFrames: 0,
    };
  }

  const frameDuration = 1_000 / Math.max(targetFps, 1);
  const elapsed = timestamp - previousRenderTimestamp;
  const dueFrames = Math.floor(
    (elapsed + FRAME_SCHEDULE_TOLERANCE_MS) / frameDuration,
  );

  if (dueFrames < 1) {
    return {
      shouldRender: false,
      nextRenderTimestamp: previousRenderTimestamp,
      lateFrames: 0,
    };
  }

  return {
    shouldRender: true,
    nextRenderTimestamp: previousRenderTimestamp + dueFrames * frameDuration,
    lateFrames: Math.max(0, dueFrames - 1),
  };
}
