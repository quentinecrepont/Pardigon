import { resolveBlendMode, type BlendModeSupport } from "./blendMode.js";
import { grainPresets } from "./presets.js";
import type {
  GrainAnimationMode,
  GrainMaskMode,
  GrainPresetName,
  GrainQualityMode,
  GrainSettings,
} from "./types.js";

export const DEFAULT_SETTINGS: Readonly<GrainSettings> = Object.freeze({
  intensity: 0.06,
  color: "#ffffff",
  blendMode: "normal",
  size: 1,
  scaleX: 100,
  scaleY: 100,
  animated: true,
  blur: 0,
  complexity: 0.35,
  character: 0,
  chromatic: 0,
  continuity: 0,
  flicker: 0,
  dirt: 0,
  speed: 1,
  fps: 24,
  animationMode: "evolve",
});

type NumericSetting = {
  [Key in keyof GrainSettings]: GrainSettings[Key] extends number ? Key : never;
}[keyof GrainSettings];

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** NaN and infinite values would reach the shader and break the grain. */
export function requireFiniteNumber(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Pardigon: ${name} must be a finite number (${String(value)}).`);
  }
  return value;
}

export function normalizeHexColor(value: unknown): string {
  const match = typeof value === "string"
    ? /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim())
    : null;

  if (!match?.[1]) {
    throw new Error(`Pardigon: invalid hex color (${String(value)}).`);
  }

  const hex = match[1].length === 3
    ? [...match[1]].map((character) => character.repeat(2)).join("")
    : match[1];
  return `#${hex.toLowerCase()}`;
}

export function resolvePreset(
  name: GrainPresetName | undefined,
): Readonly<GrainSettings> | undefined {
  if (name === undefined) return undefined;
  if (!Object.hasOwn(grainPresets, name)) {
    throw new Error(`Pardigon: unknown preset (${String(name)}).`);
  }
  return grainPresets[name];
}

export function resolveMaskMode(value: GrainMaskMode | undefined): GrainMaskMode {
  if (value === undefined || value === "none") return "none";
  if (value === "text") return "text";
  throw new Error(`Pardigon: unknown mask mode (${String(value)}).`);
}

export function resolveQualityMode(
  value: GrainQualityMode | undefined,
): GrainQualityMode {
  if (value === undefined || value === "fixed") return "fixed";
  if (value === "auto") return "auto";
  throw new Error(`Pardigon: unknown quality mode (${String(value)}).`);
}

function resolveAnimationMode(value: unknown): GrainAnimationMode {
  if (value === "evolve" || value === "flow") return value;
  throw new Error(`Pardigon: unknown animationMode (${String(value)}).`);
}

export function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value === "boolean") return value;
  throw new Error(`Pardigon: ${name} must be true or false (${String(value)}).`);
}

/**
 * Resolves every grain setting, using `base` for options left undefined.
 * Invalid values throw before anything is applied. Blend modes are the
 * documented exception: browser support varies, so they fall back to normal.
 */
export function resolveSettings(
  options: Partial<GrainSettings>,
  base: Readonly<GrainSettings>,
  supportsBlendMode?: BlendModeSupport,
): GrainSettings {
  const number = (name: NumericSetting): number =>
    requireFiniteNumber(name, options[name] ?? base[name]);

  return {
    intensity: clamp(number("intensity"), 0, 1),
    color: normalizeHexColor(options.color ?? base.color),
    blendMode: resolveBlendMode(
      options.blendMode ?? base.blendMode,
      supportsBlendMode,
    ),
    size: Math.max(number("size"), 0.1),
    scaleX: Math.max(number("scaleX"), 1),
    scaleY: Math.max(number("scaleY"), 1),
    animated: requireBoolean("animated", options.animated ?? base.animated),
    blur: clamp(number("blur"), 0, 1),
    complexity: clamp(number("complexity"), 0, 1),
    character: clamp(number("character"), 0, 1),
    chromatic: clamp(number("chromatic"), 0, 1),
    continuity: clamp(number("continuity"), 0, 1),
    flicker: clamp(number("flicker"), 0, 1),
    dirt: clamp(number("dirt"), 0, 1),
    speed: Math.max(number("speed"), 0.05),
    fps: clamp(number("fps"), 1, 60),
    animationMode: resolveAnimationMode(
      options.animationMode ?? base.animationMode,
    ),
  };
}
