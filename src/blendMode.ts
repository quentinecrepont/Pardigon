import type { GrainBlendMode } from "./types";

const GRAIN_BLEND_MODES: readonly GrainBlendMode[] = [
  "normal",
  "soft-light",
  "overlay",
  "multiply",
  "screen",
];

type BlendModeSupport = (property: string, value: string) => boolean;

const browserSupportsBlendMode: BlendModeSupport = (property, value) =>
  typeof CSS !== "undefined"
  && typeof CSS.supports === "function"
  && CSS.supports(property, value);

const isGrainBlendMode = (value: unknown): value is GrainBlendMode =>
  typeof value === "string"
  && GRAIN_BLEND_MODES.includes(value as GrainBlendMode);

export function resolveBlendMode(
  value: unknown,
  supports: BlendModeSupport = browserSupportsBlendMode,
): GrainBlendMode {
  if (!isGrainBlendMode(value)) return "normal";
  if (value === "normal") return value;
  return supports("mix-blend-mode", value) ? value : "normal";
}
