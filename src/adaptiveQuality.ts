/** Frame interval of a 60 Hz display, used as the reference for all thresholds. */
const REFERENCE_INTERVAL_MS = 1_000 / 60;
const SLOW_FRAME_MS = 24;
const POOR_P95_MS = 28;
const STABLE_P95_MS = 20;
const POOR_SLOW_SHARE = 0.18;
const STABLE_SLOW_SHARE = 0.05;
const POOR_SAMPLE_COUNT = 2;
const STABLE_SAMPLE_COUNT = 5;
const PROBE_MIN_IMPROVEMENT = 0.15;

export interface QualityProbe {
  /** Level to return to if the lowest level does not help. */
  fromLevel: number;
  /** Frame-time P95 measured just before the probe. */
  frameTimeP95Ms: number;
}

export interface AdaptiveQualityState {
  level: number;
  poorSamples: number;
  stableSamples: number;
  /** Frame interval treated as normal. It rises when a slowdown is outside Pardigon's control. */
  baselineIntervalMs: number;
  probe: QualityProbe | null;
}

export const INITIAL_ADAPTIVE_QUALITY: Readonly<AdaptiveQualityState> =
  Object.freeze({
    level: 0,
    poorSamples: 0,
    stableSamples: 0,
    baselineIntervalMs: REFERENCE_INTERVAL_MS,
    probe: null,
  });

export function percentile(values: readonly number[], ratio: number): number {
  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sortedValues.length - 1,
    Math.floor(sortedValues.length * ratio),
  );
  return sortedValues[index] ?? 0;
}

/**
 * Updates the adaptive quality level from one sample of frame intervals.
 *
 * Slow frames do not always come from Pardigon: power-saving modes cap the
 * browser at 30 Hz, and the page itself can be busy. Before lowering quality,
 * the lowest level is tested for one sample. If frames do not get faster,
 * the previous level returns and the measured cadence becomes the new normal.
 */
export function evaluateQualitySample(
  state: Readonly<AdaptiveQualityState>,
  frameIntervals: readonly number[],
  maxLevel: number,
): AdaptiveQualityState {
  if (frameIntervals.length === 0) return { ...state };

  const frameTimeP95 = percentile(frameIntervals, 0.95);
  // A tolerated slowdown fades as soon as frames get faster again.
  const baseline = Math.max(
    REFERENCE_INTERVAL_MS,
    Math.min(state.baselineIntervalMs, frameTimeP95),
  );
  const scale = baseline / REFERENCE_INTERVAL_MS;
  const slowFrames = frameIntervals.filter(
    (interval) => interval > SLOW_FRAME_MS * scale,
  ).length;
  const slowShare = slowFrames / frameIntervals.length;
  const isPoor = frameTimeP95 > POOR_P95_MS * scale
    || slowShare > POOR_SLOW_SHARE;
  const isStable = frameTimeP95 < STABLE_P95_MS * scale
    && slowShare < STABLE_SLOW_SHARE;

  if (state.probe) {
    const improved = !isPoor
      || frameTimeP95
        <= state.probe.frameTimeP95Ms * (1 - PROBE_MIN_IMPROVEMENT);
    return {
      // Pardigon was the cause: keep one step down from the original level.
      // Otherwise the browser or the page is the cause: restore the level.
      level: improved
        ? Math.min(state.probe.fromLevel + 1, maxLevel)
        : state.probe.fromLevel,
      poorSamples: 0,
      stableSamples: 0,
      baselineIntervalMs: improved ? baseline : Math.max(baseline, frameTimeP95),
      probe: null,
    };
  }

  const poorSamples = isPoor ? state.poorSamples + 1 : 0;
  const stableSamples = isStable ? state.stableSamples + 1 : 0;

  if (poorSamples >= POOR_SAMPLE_COUNT && state.level < maxLevel) {
    return {
      level: maxLevel,
      poorSamples: 0,
      stableSamples: 0,
      baselineIntervalMs: baseline,
      probe: { fromLevel: state.level, frameTimeP95Ms: frameTimeP95 },
    };
  }

  if (stableSamples >= STABLE_SAMPLE_COUNT && state.level > 0) {
    return {
      level: state.level - 1,
      poorSamples: 0,
      stableSamples: 0,
      baselineIntervalMs: baseline,
      probe: null,
    };
  }

  return {
    level: state.level,
    poorSamples,
    stableSamples,
    baselineIntervalMs: baseline,
    probe: null,
  };
}

/** Drops partial samples. A probe cut short returns to its original level. */
export function interruptQualitySampling(
  state: Readonly<AdaptiveQualityState>,
): AdaptiveQualityState {
  return {
    level: state.probe ? state.probe.fromLevel : state.level,
    poorSamples: 0,
    stableSamples: 0,
    baselineIntervalMs: state.baselineIntervalMs,
    probe: null,
  };
}
