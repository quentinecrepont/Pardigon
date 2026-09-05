import {
  createGrain,
  grainPresets,
  isWebGL2Supported,
  type GrainInstance,
  type GrainMaskMode,
  type GrainBlendMode,
  type GrainOptions,
  type GrainPresetName,
  type GrainQualityMode,
} from "pardigon";

const preset: GrainPresetName = "8mm";
const quality: GrainQualityMode = "auto";
const blendMode: GrainBlendMode = "soft-light";
const mask: GrainMaskMode = "text";
const options: GrainOptions = {
  target: document.body,
  preset,
  intensity: grainPresets[preset].intensity,
  color: "#7ac7ff",
  blendMode,
  mask,
  character: 0.65,
  continuity: 0.8,
  flicker: 0.25,
  dirt: 0.2,
  quality,
  respectReducedMotion: true,
};

if (isWebGL2Supported()) {
  const grain: GrainInstance = createGrain(options);
  grain.update({ preset: "fog", intensity: 0.05 });
  grain.update({ color: "#1683ff" });
  grain.update({ blendMode: "overlay" });
  grain.update({ mask: "none" });
  grain.update({ mask: "text" });
  grain.update({ character: 0.4 });
  grain.update({ continuity: 0.75 });
  grain.update({ flicker: 0.4 });
  grain.update({ dirt: 0.3 });
  grain.update({ quality: "fixed" });
  grain.update({ quality: "auto" });
  grain.update({ respectReducedMotion: false });
  const metrics = grain.getMetrics();
  metrics.gpuTimeMs;
  metrics.gpuTimerSupported;
  metrics.quality;
  metrics.qualityLevel;
  metrics.renderScale;
  metrics.effectiveFps;
  metrics.effectiveComplexity;
  metrics.actualFps;
  metrics.renderedFrames;
  metrics.lateFrames;
  metrics.frameTimeP95Ms;
  grain.pause();
  grain.play();
  grain.destroy();
}
