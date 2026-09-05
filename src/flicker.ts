const MAX_FLICKER_OPACITY = 0.09;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const fract = (value: number): number => value - Math.floor(value);

function hash1d(value: number): number {
  return fract(Math.sin(value * 12.9898 + 78.233) * 43_758.5453);
}

function smoothNoise1d(value: number): number {
  const index = Math.floor(value);
  const fraction = fract(value);
  const curve = fraction * fraction * (3 - 2 * fraction);
  const current = hash1d(index);
  const next = hash1d(index + 1);
  return current + (next - current) * curve;
}

/** Returns a signed black/white overlay opacity for one rendered frame. */
export function calculateFlickerExposure(
  elapsedTime: number,
  amount: number,
  fps: number,
  speed: number,
): number {
  const normalizedAmount = clamp(amount, 0, 1);
  if (normalizedAmount === 0) return 0;

  const time = Math.max(elapsedTime, 0) * Math.max(speed, 0.05);
  const cadence = clamp(fps, 1, 24);

  // A slow exposure drift gives the image a living baseline.
  const drift = (smoothNoise1d(time * 0.55 + 17.4) * 2 - 1) * 0.58;

  // A smaller frame-bound variation keeps the movement tied to the film cadence.
  const temporalFrame = Math.floor(time * cadence);
  const frameJitter = (hash1d(temporalFrame + 101.7) * 2 - 1) * 0.17;

  // Short exposure jumps appear in only some irregular time windows.
  const eventTime = time / 1.8;
  const eventIndex = Math.floor(eventTime);
  const eventPosition = fract(eventTime);
  const eventGate = hash1d(eventIndex + 211.3) > 0.78 ? 1 : 0;
  const eventCenter = 0.18 + hash1d(eventIndex + 307.1) * 0.64;
  const eventWidth = 0.035 + hash1d(eventIndex + 401.9) * 0.04;
  let eventEnvelope = clamp(
    1 - Math.abs(eventPosition - eventCenter) / eventWidth,
    0,
    1,
  );
  eventEnvelope = eventEnvelope * eventEnvelope * (3 - 2 * eventEnvelope);
  const eventDirection = hash1d(eventIndex + 503.5) > 0.5 ? 1 : -1;
  const exposureJump = eventGate * eventEnvelope * eventDirection * 0.55;

  const signal = clamp(drift + frameJitter + exposureJump, -1, 1);
  return signal * normalizedAmount * MAX_FLICKER_OPACITY;
}
