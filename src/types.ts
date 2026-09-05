export type GrainAnimationMode = "evolve" | "flow";
export type GrainBlendMode =
  | "normal"
  | "soft-light"
  | "overlay"
  | "multiply"
  | "screen";
export type GrainQualityMode = "fixed" | "auto";

export type GrainPresetName =
  | "8mm"
  | "16mm"
  | "35mm"
  | "paper"
  | "pixel"
  | "fog";

export interface GrainSettings {
  /** Maximum grain opacity, between 0 and 1. */
  intensity: number;
  /** Tint applied to the light part of the grain as a CSS hex color. */
  color: string;
  /** Controls how the complete grain canvas blends with its backdrop. */
  blendMode: GrainBlendMode;
  /** Grain cell size in CSS pixels. */
  size: number;
  /** Animates or freezes the grain. */
  animated: boolean;
  /** Softens noise transitions, between 0 and 1. */
  blur: number;
  /** Adds detail frequencies, between 0 and 1. */
  complexity: number;
  /** Controls the spatial clustering of the grain, between 0 and 1. */
  character: number;
  /** Links successive noise states, between hard cuts and continuous evolution. */
  continuity: number;
  /** Adds irregular film-like exposure variation, between 0 and 1. */
  flicker: number;
  /** Adds sparse procedural film dust and spots, between 0 and 1. */
  dirt: number;
  /** Multiplies the animation speed. */
  speed: number;
  /** Temporal frame rate used by the grain. */
  fps: number;
  /** Regenerates frames or moves the noise field continuously. */
  animationMode: GrainAnimationMode;
}

export interface GrainOptions extends Partial<GrainSettings> {
  /** Element that receives the canvas. Defaults to document.body. */
  target?: HTMLElement;
  /** Built-in settings applied before explicit options. */
  preset?: GrainPresetName;
  /** Freezes animation when the user requests reduced motion. Defaults to true. */
  respectReducedMotion?: boolean;
  /** Keeps full quality or adapts rendering cost to frame stability. */
  quality?: GrainQualityMode;
}

export interface GrainUpdateOptions extends Partial<GrainSettings> {
  /** Replaces the current settings with a built-in preset before overrides. */
  preset?: GrainPresetName;
  /** Enables or disables reduced-motion handling. */
  respectReducedMotion?: boolean;
  /** Keeps full quality or adapts rendering cost to frame stability. */
  quality?: GrainQualityMode;
}

export interface GrainMetrics {
  /** Latest sampled shader draw time in milliseconds. */
  gpuTimeMs: number | null;
  /** Whether the browser exposes a WebGL2 GPU timer. */
  gpuTimerSupported: boolean;
  /** Current quality mode. */
  quality: GrainQualityMode;
  /** Adaptive level from 0 (full) to 3 (minimum). */
  qualityLevel: number;
  /** Current internal resolution multiplier. */
  renderScale: number;
  /** Current grain frame-rate limit after adaptation. */
  effectiveFps: number;
  /** Current shader complexity after adaptation. */
  effectiveComplexity: number;
  /** Actual Pardigon draw rate sampled over the latest one-second window. */
  actualFps: number | null;
  /** Total successful draw calls since this grain instance was created. */
  renderedFrames: number;
  /** Scheduled grain frames missed because rendering arrived too late. */
  lateFrames: number;
  /** 95th percentile of actual intervals between Pardigon draw calls. */
  frameTimeP95Ms: number | null;
}

export interface GrainInstance {
  update(options: GrainUpdateOptions): void;
  getMetrics(): GrainMetrics;
  pause(): void;
  play(): void;
  destroy(): void;
}
