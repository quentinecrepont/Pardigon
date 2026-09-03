import {
  createGrain,
  grainPresets,
  isWebGL2Supported,
  type GrainInstance,
  type GrainOptions,
  type GrainPresetName,
  type GrainQualityMode,
} from "pardigon";

const preset: GrainPresetName = "8mm";
const quality: GrainQualityMode = "auto";
const options: GrainOptions = {
  target: document.body,
  preset,
  intensity: grainPresets[preset].intensity,
  color: "#7ac7ff",
  character: 0.65,
  quality,
  respectReducedMotion: true,
};

if (isWebGL2Supported()) {
  const grain: GrainInstance = createGrain(options);
  grain.update({ preset: "fog", intensity: 0.05 });
  grain.update({ color: "#1683ff" });
  grain.update({ character: 0.4 });
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
  grain.pause();
  grain.play();
  grain.destroy();
}
