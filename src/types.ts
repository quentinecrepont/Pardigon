export type GrainAnimationMode = "evolve" | "flow";

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
  /** Grain cell size in CSS pixels. */
  size: number;
  /** Animates or freezes the grain. */
  animated: boolean;
  /** Softens noise transitions, between 0 and 1. */
  blur: number;
  /** Adds detail frequencies, between 0 and 1. */
  complexity: number;
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
}

export interface GrainUpdateOptions extends Partial<GrainSettings> {
  /** Replaces the current settings with a built-in preset before overrides. */
  preset?: GrainPresetName;
  /** Enables or disables reduced-motion handling. */
  respectReducedMotion?: boolean;
}

export interface GrainMetrics {
  /** Latest sampled shader draw time in milliseconds. */
  gpuTimeMs: number | null;
  /** Whether the browser exposes a WebGL2 GPU timer. */
  gpuTimerSupported: boolean;
}

export interface GrainInstance {
  update(options: GrainUpdateOptions): void;
  getMetrics(): GrainMetrics;
  pause(): void;
  play(): void;
  destroy(): void;
}
